import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Input,
  OnInit,
  signal,
  SimpleChanges,
} from '@angular/core';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';
import { ProjectInfoService } from '../project-info.service';
import { LabelerCenterPanelComponent } from './labeler-center-panel/labeler-center-panel.component';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessionService } from '../session.service';
import { LabelFile } from '../label-file.model';
import { BehaviorSubject, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { CsvParserService } from '../csv-parser.service';
import * as dfd from 'danfojs';
import { LKeypoint, SaveActionData } from './types';
import { Frame } from './frame.model';
import { MultiView } from '../multiview.model';
import { Pair } from '../utils/pair';

@Component({
  selector: 'app-labeler',
  imports: [
    LoadingBarComponent,
    LabelerCenterPanelComponent,
    RouterLinkActive,
    RouterLink,
  ],
  templateUrl: './labeler-page.component.html',
  styleUrl: './labeler-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerPageComponent implements OnInit {
  protected isIniting = signal(true);
  private projectInfoService = inject(ProjectInfoService);
  protected sessionService = inject(SessionService);
  private httpClient = inject(HttpClient);
  private csvParser = inject(CsvParserService);

  // Store the parsed DataFrame for the selected label file
  protected labelFileData = signal<dfd.DataFrame | null>(null);
  protected allFrames = signal<Frame[] | null>(null);
  // Store the loading state
  protected isLoading = signal(false);

  private _labelFile: string | null = null;
  @Input()
  set labelFile(x: string | null) {
    this._labelFile = x;
  }

  private _frameKey: string | null = null;
  @Input()
  set frameKey(x: string | null) {
    this._frameKey = x;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['labelFile']) {
      this.setSelectedLabelFile(
        this.sessionService
          .allLabelFiles()
          .find((x) => x.key === this._labelFile) ?? null,
      );
    }

    if (this.selectedLabelFile() && changes['frameKey']) {
      const selectedFrame: Frame | null =
        this.allFrames()?.find((x) => x.key === this._frameKey) ?? null;
      this.setSelectedFrame(selectedFrame);
    }
  }

  private _selectedLabelFile = new BehaviorSubject<LabelFile | null>(null);
  selectedLabelFile$ = this._selectedLabelFile
    .asObservable()
    .pipe(distinctUntilChanged());
  protected selectedLabelFile = toSignal(this.selectedLabelFile$, {
    requireSync: true,
  });
  protected setSelectedLabelFile(labelFile: LabelFile | null) {
    this._selectedLabelFile.next(labelFile);
  }

  private _selectedFrame = new BehaviorSubject<Frame | null>(null);
  selectedFrame$ = this._selectedFrame
    .asObservable()
    .pipe(distinctUntilChanged());
  protected selectedFrame = toSignal(this.selectedFrame$, {
    requireSync: true,
  });
  protected setSelectedFrame(frame: Frame | null) {
    this._selectedFrame.next(frame);
  }

  protected keypoints = computed((): MultiView<LKeypoint[]> | null => {
    const idx = this.selectedFrame()?.key;
    if (!idx) return null;
    const labelFileData = this.labelFileData();
    if (!labelFileData) return null;
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
          ? (labelFileData.at(idx, xColumn.toMapKey()) as number)
          : null;
        const y = yColumn
          ? (labelFileData.at(idx, yColumn.toMapKey()) as number)
          : null;

        if (x == null || y == null) return null;
        return { keypointName, x, y };
      })
      .filter((x) => x != null);

    return {
      key: 'stuff',
      views: { top: kps },
    };
  });

  // private labelerCenterPanel = viewChild(LabelerCenterPanelComponent);

  // Load the CSV file for the selected label file
  private async loadLabelFileData(labelFile: LabelFile | null) {
    if (!labelFile || labelFile.views.length === 0) {
      this.labelFileData.set(null);
      return;
    }

    try {
      this.isLoading.set(true);
      // Use the first view's CSV path
      const csvPath = labelFile.views[0].csvPath;
      // Fetch the CSV file
      const csvString = await this.fetchCsvFile(csvPath);
      if (!csvString) {
        console.error('Failed to load CSV file:', csvPath);
        return;
      }

      // Parse the CSV file
      const df = this.csvParser.parsePredictionFile(csvString);
      this.labelFileData.set(df);
      this.allFrames.set(
        df.index.map((imgPath) => {
          imgPath = imgPath as string;
          return {
            key: imgPath, // todo extract out view,
            views: [
              {
                viewName: 'top',
                imgPath,
              },
            ],
          };
        }),
      );
    } catch (error) {
      console.error('Error loading label file data:', error);
      this.labelFileData.set(null);
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

  protected async handleSaveAction(data: SaveActionData): Promise<void> {
    // update local multiview dataframe state
    // multiview labels save RPC call
  }

  async ngOnInit() {
    await this.projectInfoService.loadProjectInfo();
    await this.sessionService.loadLabelFiles();
    this.setSelectedLabelFile(this.sessionService.allLabelFiles()[0] ?? null);
    this.isIniting.set(false);
  }

  constructor() {
    this.selectedLabelFile$
      .pipe(takeUntilDestroyed())
      .subscribe((labelFile) => {
        // Load the CSV file when the selected label file changes
        this.loadLabelFileData(labelFile);
      });
  }
}
