import { inject, Injectable } from '@angular/core';
import { MVLabelFile } from '../label-file.model';
import { FrameView, MVFrame } from './frame.model';
import { LKeypoint } from './types';
import { firstValueFrom } from 'rxjs';
import * as dfd from 'danfojs';
import { HttpClient } from '@angular/common/http';
import { CsvParserService } from '../csv-parser.service';
import { Pair } from '../utils/pair';

@Injectable({
  providedIn: 'root',
})
export class LabelFileFetcherService {
  private httpClient = inject(HttpClient);
  private csvParser = inject(CsvParserService);

  async loadLabelFileData(labelFile: MVLabelFile): Promise<MVFrame[]> {
    // For each view, fetch and process CSV files.
    // Every file is processed once it loads, independently of other files,
    // to spread out CSV parsing load over time (instead of parsing all at once).
    const csvRequests = labelFile.views.map((labelFileView) => {
      const { csvPath } = labelFileView;
      return this.fetchCsvFile(csvPath).then((csvString) => {
        if (!csvString) {
          throw new Error('Failed to load CSV file: ' + csvPath);
        }
        // Parse the CSV file
        const df = this.csvParser.parsePredictionFile(csvString);
        return { lfv: labelFileView, df: df };
      });
    });

    const mvFramePromise = Promise.all(csvRequests).then((results) => {
      const mvFrames = this.zipDataframesIntoMVFrame(results);
      return mvFrames;
    });

    const unlabeledPromise = Promise.all(
      labelFile.views.map((labelFileView) => {
        const sidecarPath = this.getUnlabeledSidecarPath(labelFileView.csvPath);
        return firstValueFrom(
          this.httpClient.get('/app/v0/files/' + sidecarPath, {
            responseType: 'text',
          }),
        )
          .catch((e) => {
            if (e.status === 404) {
              return null;
            } else {
              throw new Error('Error fetching CSV file: ' + sidecarPath);
            }
          })
          .then((filecontents) => {
            if (!filecontents) {
              return null;
            }
            const lines = filecontents
              .split('\n')
              .map((line) => line.trim())
              .filter((x) => x);
            return { lfv: labelFileView, lines };
          });
      }),
    ).then((results) => {
      if (results.some((r) => r == null)) {
        return [];
      }
      // Create an array of MVFrame. the ith MVFrame is the
      // ith line across all results.
      const maxLines = Math.max(...results.map((r) => r!.lines.length));
      return Array.from({ length: maxLines }).map((_, i): MVFrame => {
        const views = results
          .map((r): FrameView | null => {
            const imgPath = r!.lines[i];

            return {
              viewName: r!.lfv.viewName,
              imgPath,
              keypoints: [], // we'll patch this later once labeledframes are loaded.
              originalKeypoints: null,
            };
          })
          .filter((x): x is FrameView => x !== null);
        const key = views[0].imgPath.replace(views[0].viewName, '*');
        return { key, views };
      });
    });

    const mvf = await mvFramePromise;
    const unl = await unlabeledPromise;

    // Initialize keypoints for unlabeled frames to NaN.
    // TODO sort order as specified by user
    // TODO get allKeypoints from project config if no labeled frames present.
    const allKeypoints =
      mvf[0]?.views[0]?.keypoints?.map((kp) => kp.keypointName) ?? null;
    if (allKeypoints !== null) {
      unl.forEach((unlFrame) => {
        unlFrame.views.forEach((unlView) => {
          unlView.keypoints = allKeypoints.map((keypointName) => {
            return {
              x: NaN,
              y: NaN,
              keypointName,
            };
          });
        });
      });
    }
    return mvf.concat(unl);
  }

  private getUnlabeledSidecarPath(csvPath: string): string {
    return csvPath.replace(/\.csv$/, '.unlabeled');
  }

  // Fetch the CSV file using HttpClient
  private async fetchCsvFile(csvPath: string): Promise<string | null> {
    try {
      // Construct the URL to the CSV file
      const url = '/app/v0/files/' + csvPath;
      // Make a GET request to fetch the CSV file
      return await firstValueFrom(
        this.httpClient.get(url, { responseType: 'text' }),
      );
    } catch (error) {
      console.error('Error fetching CSV file:', error);
      return null;
    }
  }

  private parseKPsOfDfRow(
    labelFileData: dfd.DataFrame,
    currIndex: string,
  ): LKeypoint[] {
    const columns = labelFileData.columns.map(Pair.fromMapKey) as Pair<
      string,
      string
    >[];

    const groupedColumns = columns.reduce(
      (acc, column) => {
        const bodyPart = column.first;
        if (!acc[bodyPart]) {
          acc[bodyPart] = [];
        }
        acc[bodyPart].push(column);
        return acc;
      },
      {} as Record<string, Pair<string, string>[]>,
    );

    const kps: LKeypoint[] = Object.entries(groupedColumns)
      .map(([keypointName, cols]) => {
        const xColumn = cols.find((col) => col.second === 'x');
        const yColumn = cols.find((col) => col.second === 'y');

        const x = xColumn
          ? (labelFileData.at(currIndex, xColumn.toMapKey()) as number)
          : null;
        const y = yColumn
          ? (labelFileData.at(currIndex, yColumn.toMapKey()) as number)
          : null;

        if (x == null || y == null) return null;
        return { keypointName, x, y };
      })
      .filter((x) => x != null);

    return kps;
  }

  private zipDataframesIntoMVFrame(
    results: {
      lfv: { viewName: string; csvPath: string };
      df: dfd.DataFrame;
    }[],
  ): MVFrame[] {
    const framesPerView = {} as Record<string, FrameView[]>;

    results.forEach(({ lfv, df }) => {
      framesPerView[lfv.viewName] = this.dfToFrameView(lfv.viewName, df);
    });

    const maxRowCount = Math.max(
      ...Object.values(framesPerView).map((frames) => frames.length),
    );

    const mvFrames = Array.from({ length: maxRowCount }).map(
      (_, i): MVFrame => {
        const views = Object.values(framesPerView)
          .map((frameViews) => frameViews[i])
          .filter((x) => x != null);
        const key = views[0].imgPath.replace(views[0].viewName, '*');
        return {
          key,
          views,
        };
      },
    );
    return mvFrames;
  }

  private dfToFrameView(
    viewName: string,
    labelFileData: dfd.DataFrame,
  ): FrameView[] {
    // map each row of the label file to an MVFrame.
    return labelFileData.index.map((imgPath): FrameView => {
      imgPath = imgPath as string;
      const kpArray = this.parseKPsOfDfRow(labelFileData, imgPath);

      return {
        viewName,
        imgPath,
        keypoints: kpArray,
        originalKeypoints: structuredClone(kpArray),
      };
    });
  }
}
