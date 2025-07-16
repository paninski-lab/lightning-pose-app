import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
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
  protected isIniting = signal(false);
  private projectInfoService = inject(ProjectInfoService);
  protected sessionService = inject(SessionService);
  private httpClient = inject(HttpClient);
  private csvParser = inject(CsvParserService);

  // Store the parsed DataFrame for the selected label file
  protected labelFileData = signal<dfd.DataFrame | null>(null);
  // Store the keypoints extracted from the CSV file
  protected keypoints = signal<string[]>([]);
  // Store the loading state
  protected isLoading = signal(false);

  private _selectedLabelFile = new BehaviorSubject<LabelFile | null>(null);
  selectedLabelFile$ = this._selectedLabelFile
    .asObservable()
    .pipe(distinctUntilChanged());
  protected selectedLabelFile = toSignal(this.selectedLabelFile$, {
    requireSync: true,
  });
  setSelectedLabelFile(labelFile: LabelFile | null) {
    this._selectedLabelFile.next(labelFile);
  }

  // Load the CSV file for the selected label file
  private async loadLabelFileData(labelFile: LabelFile | null) {
    if (!labelFile || labelFile.views.length === 0) {
      this.labelFileData.set(null);
      this.keypoints.set([]);
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

      // Extract keypoints from the CSV file
      const extractedKeypoints = this.csvParser.getBodyParts(csvString);
      this.keypoints.set(extractedKeypoints);
    } catch (error) {
      console.error('Error loading label file data:', error);
      this.labelFileData.set(null);
      this.keypoints.set([]);
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
