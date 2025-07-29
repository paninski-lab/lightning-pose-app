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
import { PathPipe } from '../components/path.pipe';
import { LabelFileFetcherService } from './label-file-fetcher.service';
import { SaveActionData } from './types';
import { MVFrame } from './frame.model';

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
  private labelFileFetcher = inject(LabelFileFetcherService);
  private router = inject(Router);

  // Store loaded data for the selected label file
  protected labelFileData = signal<MVFrame[] | null>(null);
  protected labelFileDataLabeledSlice = computed(() => {
    const labelFileData = this.labelFileData();
    if (!labelFileData) return [];
    return labelFileData.filter((x) => {
      return x.views[0].keypoints.length > 0;
    });
  });
  protected labelFileDataUnLabeledSlice = computed(() => {
    const labelFileData = this.labelFileData();
    if (!labelFileData) return [];
    return labelFileData.filter((x) => {
      return x.views[0].keypoints.length === 0;
    });
  });

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
        : this.labelFileData()?.find((x) => x.key === this.frameKey());
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
      this.labelFileData.set(null);
      return;
    }

    try {
      this.isLoading.set(true);
      const mvFrames = await this.labelFileFetcher.loadLabelFileData(labelFile);

      this.labelFileData.set(mvFrames);
    } catch (error) {
      console.error('Error loading label file data:', error);
      this.labelFileData.set(null);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
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
