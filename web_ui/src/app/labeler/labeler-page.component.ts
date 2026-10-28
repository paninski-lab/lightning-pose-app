import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../components/dropdown/dropdown.component';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  NgZone,
  OnChanges,
  OnInit,
  signal,
  SimpleChanges,
  viewChild,
} from '@angular/core';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';
import { ProjectInfoService } from '../project-info.service';
import { LabelerCenterPanelComponent } from './labeler-center-panel/labeler-center-panel.component';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SessionService } from '../session.service';
import { MVLabelFile } from '../label-file.model';
import { PathPipe } from '../utils/pipes';
import LabelFileFetcherService from './label-file-fetcher.service';
import { mvf, MVFrame } from './frame.model';
import { ExtractFramesDialogComponent } from './extract-frames-dialog/extract-frames-dialog.component';
import { ToastService } from '../toast.service';
import { LabelFilePickerComponent } from '../label-file-picker/label-file-picker.component';
import _ from 'lodash';
import { SplitAreaComponent, SplitComponent } from 'angular-split';
import { clampSplitPane, gutterPixels } from '../split-pane-limit';

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
    SplitComponent,
    SplitAreaComponent,
    DropdownComponent,
    DropdownTriggerComponent,
    DropdownContentComponent,
    DropdownTriggerDirective,
  ],
  templateUrl: './labeler-page.component.html',
  styleUrl: './labeler-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerPageComponent implements OnInit, OnChanges {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);
  private injector = inject(Injector);
  private leftPane = viewChild<SplitAreaComponent>('leftPane');
  /** The frame list stops when it meets the right-hand panel. */
  protected leftPaneMax = signal(10000);
  protected leftPaneSize = signal(280);

  protected isIniting = signal(true);
  protected projectInfoService = inject(ProjectInfoService);
  protected sessionService = inject(SessionService);
  private labelFileFetcher = inject(LabelFileFetcherService);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private notificationDisplayTimeMs = 1500; // Config variable for notification display time

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

  protected hasNextFrame = computed(() => {
    const frames = this.labelFileData();
    const frameKey = this.frameKey();
    if (!frames || frameKey == null) return false;
    const index = frames.findIndex((f) => f.key === frameKey);
    return index >= 0 && index < frames.length - 1;
  });

  protected hasPreviousFrame = computed(() => {
    const frames = this.labelFileData();
    const frameKey = this.frameKey();
    if (!frames || frameKey == null) return false;
    return frames.findIndex((f) => f.key === frameKey) > 0;
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
    shouldAdvanceFrame: boolean;
    deletion?: boolean;
  }) {
    if (data.labelFile !== this.loadedLabelFile()) {
      return;
    }
    const currentFrameIndex = this.labelFileData()!.findIndex(
      (mvf) => mvf.key === data.frame.key,
    );
    // Updates local state without re-fetching the label file data.
    this.labelFileData.update((mvFrames) => {
      if (mvFrames === null) {
        return null;
      }
      if (data.deletion) {
        return mvFrames.filter((mvFrame) => mvFrame.key !== data.frame.key);
      } else {
        return mvFrames.map((mvFrame) => {
          if (mvFrame.key === data.frame.key) {
            return mvf(mvFrame).toSavedMvf();
          } else {
            return mvFrame;
          }
        });
      }
    });
    if (data.shouldAdvanceFrame || data.deletion) {
      const frames = this.labelFileData()!;
      let nextFrameKey: string | undefined;
      if (data.deletion) {
        // After remove, same index is the old next; clamp when deleting the last frame.
        nextFrameKey =
          frames[Math.min(currentFrameIndex, frames.length - 1)]?.key;
      } else {
        nextFrameKey = frames[currentFrameIndex + 1]?.key;
      }
      if (nextFrameKey) {
        this.router.navigate([], {
          queryParams: {
            labelFileKey: this.labelFileKey(),
            frameKey: nextFrameKey,
          },
        });
      }
    }
  }

  protected handleCloseFrame() {
    this.router.navigate([], {
      queryParams: { labelFileKey: this.labelFileKey() },
    });
  }

  protected handleNextFrame() {
    this.openFrameAtOffset(1);
  }

  protected handlePreviousFrame() {
    this.openFrameAtOffset(-1);
  }

  /** Opens the frame `offset` places away in the combined list (labeled, then remaining). Does not save. */
  private openFrameAtOffset(offset: number) {
    const frames = this.labelFileData();
    const frameKey = this.frameKey();
    if (!frames || frameKey == null) return;
    const index = frames.findIndex((frame) => frame.key === frameKey);
    if (index < 0) return;
    const targetKey = frames[index + offset]?.key;
    if (!targetKey) return;
    this.router.navigate([], {
      queryParams: {
        labelFileKey: this.labelFileKey(),
        frameKey: targetKey,
      },
    });
  }

  protected get projectKey() {
    const projectKey = this.projectInfoService.projectContext()?.key as
      | string
      | undefined;
    if (!projectKey) {
      throw new Error('Project key missing from project context');
    }
    return projectKey;
  }

  protected handleSelectLabelFile(labelFileKey: string | null) {
    const projectKey = this.projectKey;
    if (labelFileKey !== null) {
      this.router.navigate(['/project', projectKey, 'labeler'], {
        queryParams: { labelFileKey: labelFileKey },
      });
    } else {
      this.router.navigate(['/project', projectKey, 'labeler'], {
        queryParams: {},
      });
    }
  }

  async ngOnInit() {
    await this.sessionService.loadLabelFiles();

    this.isIniting.set(false);
    this.loadLabelFileData(this.selectedLabelFile());
    afterNextRender(
      () => {
        const split = this.host.nativeElement.querySelector('as-split');
        if (!split) return;
        const observer = new ResizeObserver(() => {
          this.zone.run(() => this.limitLeftPane());
        });
        observer.observe(split);
        const rightPane = split.querySelector(
          'app-labeler-center-panel as-split > as-split-area:last-child',
        );
        if (rightPane) observer.observe(rightPane);
        this.destroyRef.onDestroy(() => observer.disconnect());
        this.limitLeftPane();
      },
      { injector: this.injector },
    );
  }

  /** Keep the frame list from covering the right-hand panel. */
  protected limitLeftPane() {
    const split = this.host.nativeElement.querySelector('as-split');
    const left = this.leftPane();
    if (!split || !left) return;
    const nested = split.querySelector('app-labeler-center-panel as-split');
    const nestedAreas = nested
      ? [...nested.querySelectorAll(':scope > as-split-area')]
      : [];
    const nestedRight = nestedAreas[nestedAreas.length - 1];
    const reserved =
      (nestedRight?.clientWidth ?? 0) + (nested ? gutterPixels(nested) : 0);
    const max = split.clientWidth - gutterPixels(split) - reserved;
    const leftWidth =
      split.querySelector(':scope > as-split-area')?.clientWidth ?? 0;
    clampSplitPane(this.leftPaneSize, this.leftPaneMax, max, leftWidth);
  }

  extractFramesDialogOpen = signal<boolean>(false);
  protected xfSuccessNotifyClasses = signal('');

  async handleExtractFramesDone(labelFileKey: string) {
    this.extractFramesDialogOpen.set(false);
    if (labelFileKey === this.labelFileKey()) {
      await this.loadLabelFileData(this.selectedLabelFile());
    } else {
      // Reload label files
      await this.sessionService.loadLabelFiles();
      // Switch to the label file the extract frames was for.
      await this.router.navigate([], {
        queryParams: { labelFileKey: labelFileKey },
      });
    }

    // Ideally we'd wait until the label file load from the above navigate()
    // is done. Since we don't have a handle to that promise, we just
    // wait 300ms which will likely cover the latency.
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.xfSuccessNotifyClasses.set('border border-primary');
    setTimeout(() => {
      this.xfSuccessNotifyClasses.set('');
    }, this.notificationDisplayTimeMs);
  }

  protected getNumLabeledFramesGetter = () => this.getNumLabeledFrames();

  protected getNumLabeledFrames() {
    // count number of frames where all are labeled.
    return this.labelFileDataLabeledSlice()
      .map((entry) => {
        const keypointHasNan: Record<string, boolean> = {};
        entry.views.forEach((view) => {
          view.keypoints.forEach((kp) => {
            keypointHasNan[kp.keypointName] = isNaN(kp.x) || isNaN(kp.y);
          });
        });
        // number of keys where value is false;
        return _.invertBy(keypointHasNan)['false']?.length ?? 0;
      })
      .reduce((a, b) => a + b, 0);
  }
}
