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
    // Store output here: (initialize to preset the key insertion order)
    const parsedDfsPerView = Object.fromEntries(
      labelFile.views.map(
        ({ viewName }): [string, dfd.DataFrame | undefined] => [
          viewName,
          undefined,
        ],
      ),
    );
    // Store promises here so we can wait on them:
    const csvRequests = labelFile.views.map(async ({ viewName, csvPath }) => {
      const csvString = await this.fetchCsvFile(csvPath);
      if (!csvString) {
        console.error('Failed to load CSV file:', csvPath);
        return;
      }
      // Parse the CSV file
      const df = this.csvParser.parsePredictionFile(csvString);
      parsedDfsPerView[viewName] = df;
      return;
    });

    // Sort the dfs by order of the views in the label file.

    await Promise.all(csvRequests);

    // Narrow the type by filtering out undefined (label files that failed to load).
    const y = Object.entries(parsedDfsPerView).filter(
      ([_, df]) => df !== undefined,
    ) as [string, dfd.DataFrame][];
    const z = Object.fromEntries(y);
    const mvFrames = this.parseDfToMVFrame(z);
    return mvFrames;
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

  private parseDfToMVFrame(dfs: Record<string, dfd.DataFrame>): MVFrame[] {
    const framesPerView = {} as Record<string, FrameView[]>;

    Object.entries(dfs).forEach(([viewName, df]) => {
      framesPerView[viewName] = this.parseDfToFrameView(viewName, df);
    });

    const maxRowCount = Math.max(
      ...Object.values(framesPerView).map((frames) => frames.length),
    );

    const mvFrames = Array.from({ length: maxRowCount }).map(
      (_, i): MVFrame => {
        const views = Object.values(framesPerView)
          .map((frameViews) => frameViews[i])
          .filter((x) => x != null);
        const key = views[0].imgPath; // todo group by view.
        return {
          key,
          views,
        };
      },
    );
    return mvFrames;
  }

  private parseDfToFrameView(
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
