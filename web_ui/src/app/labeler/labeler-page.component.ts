import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnChanges,
  OnInit,
  signal,
  SimpleChanges,
} from '@angular/core';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';
import { ProjectInfoService } from '../project-info.service';
import { LabelerCenterPanelComponent } from './labeler-center-panel/labeler-center-panel.component';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SessionService } from '../session.service';
import { MVLabelFile } from '../label-file.model';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { CsvParserService } from '../csv-parser.service';
import * as dfd from 'danfojs';
import { LKeypoint, SaveActionData } from './types';
import { FrameView, MVFrame } from './frame.model';
import { Pair } from '../utils/pair';
import { PathPipe } from '../components/path.pipe';

interface LoadError {
  message: string;
  data: Record<string, string> | undefined;
}
@Component({
  selector: 'app-labeler',
  imports: [
    LoadingBarComponent,
    LabelerCenterPanelComponent,
    RouterLinkActive,
    RouterLink,
    PathPipe,
  ],
  templateUrl: './labeler-page.component.html',
  styleUrl: './labeler-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerPageComponent implements OnInit, OnChanges {
  protected isIniting = signal(true);
  private projectInfoService = inject(ProjectInfoService);
  protected sessionService = inject(SessionService);
  private httpClient = inject(HttpClient);
  private csvParser = inject(CsvParserService);
  private router = inject(Router);

  // Store the parsed DataFrame for the selected label file
  protected allFrames = signal<MVFrame[] | null>(null);
  // Store the loading state
  protected isLoading = signal(false);
  protected loadError = signal<LoadError | null>(null);

  labelFileKey = input<string | null>(null);
  frameKey = input<string | null>(null);

  protected selectedLabelFile = computed(() => {
    if (this.isIniting()) return null;
    const labelFile =
      this.labelFileKey() == null
        ? null
        : this.sessionService
            .allLabelFiles()
            .find((x) => x.key === this.labelFileKey());
    if (labelFile === undefined) {
      throw new Error(
        `Label file not found in data_dir: ${this.labelFileKey()}`,
      );
    }
    return labelFile;
  });

  protected selectedFrame = computed((): MVFrame | null => {
    if (this.isIniting() || this.isLoading()) return null;
    const selectedFrame =
      this.frameKey() == null
        ? null
        : this.allFrames()?.find((x) => x.key === this.frameKey());
    if (selectedFrame === undefined) {
      throw new Error(
        `Frame ${this.frameKey()} not found in ${this.labelFileKey()}`,
      );
    }
    return selectedFrame;
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['labelFileKey']) {
      this.loadLabelFileData(this.selectedLabelFile()).catch((error) => {
        throw error;
      });
    }
  }

  // Load the CSV file for the selected label file
  private async loadLabelFileData(labelFile: MVLabelFile | null) {
    if (!labelFile || labelFile.views.length === 0) {
      this.allFrames.set(null);
      return;
    }

    try {
      this.isLoading.set(true);

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
      this.allFrames.set(mvFrames);
    } catch (error) {
      console.error('Error loading label file data:', error);
      this.allFrames.set(null);
    } finally {
      this.isLoading.set(false);
    }
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

      return {
        viewName,
        imgPath,
        keypoints: this.parseKPsOfDfRow(labelFileData, imgPath),
      };
    });
  }

  protected async handleSaveAction(data: SaveActionData): Promise<void> {
    // update local multiview dataframe state
    // multiview labels save RPC call
    console.error('Not yet implemented: handleSaveAction');
  }

  protected handleSelectLabelFile(labelFileKey: string) {
    if (labelFileKey !== 'None') {
      this.router.navigate(['/labeler'], {
        queryParams: { labelFileKey: labelFileKey },
      });
    } else {
      this.router.navigate(['/labeler'], { queryParams: {} });
    }
  }

  async ngOnInit() {
    await this.projectInfoService.loadProjectInfo();
    await this.sessionService.loadLabelFiles();

    this.isIniting.set(false);
    this.loadLabelFileData(this.selectedLabelFile());
  }
}
