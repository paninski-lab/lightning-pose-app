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
import { mvf, MVFrame } from './frame.model';
import { ExtractFramesDialogComponent } from './extract-frames-dialog/extract-frames-dialog.component';
import { ToastService } from '../toast.service';
import { LabelFilePickerComponent } from '../label-file-picker/label-file-picker.component';

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
    LabelFilePickerComponent,
    ExtractFramesDialogComponent,
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
  private toastService = inject(ToastService);

  // Store loaded data for the selected label file
  protected loadedLabelFile = signal<MVLabelFile | null>(null);
  protected labelFileData = signal<MVFrame[] | null>(null);
  protected labelFileDataLabeledSlice = computed(() => {
    const labelFileData = this.labelFileData();
    if (!labelFileData) return [];
    return labelFileData.filter((x) => {
      return !mvf(x).isFromUnlabeledSet;
    });
  });
  protected labelFileDataUnLabeledSlice = computed(() => {
    const labelFileData = this.labelFileData();
    if (!labelFileData) return [];
    return labelFileData.filter((x) => {
      return mvf(x).isFromUnlabeledSet;
    });
  });

  // Store the loading state
  protected isLoading = signal(false);
  protected loadError = signal<LoadError | null>(null);

  // Set from the router on URL change.
  labelFileKey = input<string | null | undefined>(null);
  // Set from the router on URL change.
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
      this.loadedLabelFile.set(null);
      this.labelFileData.set(null);
      return;
    }

    try {
      this.isLoading.set(true);
      const mvFrames = await this.labelFileFetcher.loadLabelFileData(labelFile);

      this.loadedLabelFile.set(labelFile);
      this.labelFileData.set(mvFrames);
    } catch (error) {
      console.error('Error loading label file data:', error);
      this.loadedLabelFile.set(null);
      this.labelFileData.set(null);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  protected handleSaved(data: {
    labelFile: MVLabelFile;
    frame: MVFrame;
    shouldContinue: boolean;
  }) {
    if (data.labelFile !== this.loadedLabelFile()) {
      return;
    }
    this.labelFileData.update((mvFrames) => {
      if (mvFrames === null) {
        return null;
      }
      return mvFrames.map((mvFrame) => {
        if (mvFrame.key === data.frame.key) {
          return mvf(mvFrame).toSavedMvf();
        } else {
          return mvFrame;
        }
      });
    });
    if (data.shouldContinue) {
      const currentFrameIndex = this.labelFileDataUnLabeledSlice().findIndex(
        (mvf) => mvf.key === data.frame.key,
      );
      const nextFrameKey =
        this.labelFileDataUnLabeledSlice()[currentFrameIndex + 1]?.key ?? null;
      if (nextFrameKey !== null) {
        this.router.navigate(['/labeler'], {
          queryParams: {
            labelFileKey: this.labelFileKey(),
            frameKey: nextFrameKey,
          },
        });
      }
    }
  }

  protected handleSelectLabelFile(labelFileKey: string | null) {
    if (labelFileKey !== null) {
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

  extractFramesDialogOpen = signal<boolean>(false);
  protected xfSuccessNotifyClasses = signal('');

  handleExtractFramesDone() {
    this.xfSuccessNotifyClasses.set('border');
  }
}
