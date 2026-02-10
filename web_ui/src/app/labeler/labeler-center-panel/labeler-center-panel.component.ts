import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnChanges,
  output,
  signal,
  SimpleChanges,
  untracked,
  viewChild,
} from '@angular/core';
import { FrameView, mvf, MVFrame } from '../frame.model';
import { LKeypoint, lkp } from '../types';
import { DecimalPipe } from '@angular/common';
import { ZoomableContentComponent } from '../../components/zoomable-content.component';
import { KeypointContainerComponent } from '../../components/keypoint-container/keypoint-container.component';
import { Keypoint } from '../../keypoint';
import { ProjectInfoService } from '../../project-info.service';
import { HorizontalScrollDirective } from '../../components/horizontal-scroll.directive';
import { Point } from '@angular/cdk/drag-drop';
import { SessionService } from '../../session.service';
import { MVLabelFile } from '../../label-file.model';
import { GetMVAutoLabelsResponse } from '../mv-autolabel';
import { PathPipe } from '../../utils/pipes';
import { BundleAdjustDialogComponent } from '../../bundle-adjust-dialog/bundle-adjust-dialog.component';
import { ToastService } from '../../toast.service';
import { firstValueFrom, Subject } from 'rxjs';

@Component({
  selector: 'app-labeler-center-panel',
  imports: [
    DecimalPipe,
    ZoomableContentComponent,
    KeypointContainerComponent,
    HorizontalScrollDirective,
    PathPipe,
    BundleAdjustDialogComponent,
  ],
  templateUrl: './labeler-center-panel.component.html',
  styleUrl: './labeler-center-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerCenterPanelComponent implements OnChanges {
  private projectInfoService = inject(ProjectInfoService);
  private toastService = inject(ToastService);

  labelFile = input<MVLabelFile | null>(null);
  frame = input<MVFrame | null>(null);
  numLabeledFrames = input.required<number>();

  primaryZoomableElement =
    viewChild<ZoomableContentComponent>('primaryZoomable');

  saved = output<{
    labelFile: MVLabelFile;
    frame: MVFrame;
    shouldAdvanceFrame: boolean;
    deletion?: boolean;
  }>();
  private temporalContextAbortController: AbortController | undefined;

  constructor() {
    effect(() => {
      this.selectedView();

      // Reset scale when view changes.
      // Use untracked() to avoid creating a dependency on primaryZoomableElement
      untracked(() => {
        if (this.primaryZoomableElement()) {
          this.primaryZoomableElement()!.fitContentToViewport();
        }
      });
    });
  }
  ngOnChanges(changes: SimpleChanges) {
    if (changes['frame']) {
      this.abortController.abort();
      this.abortController = new AbortController();
      this.hasCameraCalibrationFiles.set(false);
      this.checkIfHasCameraCalibrationFiles();
    }

    if (changes['frame']) {
      // Reset scale.
      if (this.primaryZoomableElement()) {
        this.primaryZoomableElement()!.fitContentToViewport();
      }
    }

    // Unlabeled frames should start from the first view and keypoint.
    if (
      changes['frame'] &&
      this.frame() &&
      mvf(this.frame()!).isFromUnlabeledSet
    ) {
      this._selectedView.set(null);
      this.selectFirstKeypoint();
    }
  }

  private selectFirstKeypoint() {
    this.selectedKeypoint.set(
      this.selectedFrameView()?.keypoints[0]?.keypointName ?? null,
    );
  }

  private checkIfHasCameraCalibrationFiles() {
    const abortSignal = this.abortController.signal;
    if (!this.frame()) return;
    const sessionKey = mvf(this.frame()!).autolabelSessionKey;
    if (!sessionKey) return;
    this.sessionService
      .hasCameraCalibrationFiles(sessionKey)
      .then((hasFiles) => {
        if (abortSignal.aborted) return;
        this.hasCameraCalibrationFiles.set(hasFiles);
      });
  }

  // selectedView is always nonnull. Defaults to first view in frame.
  // Underlying selection state can be null if user hasn't selected any view explicitly yet.
  protected _selectedView = signal<string | null>(null);
  protected selectedView = computed((): string => {
    if (this._selectedView()) {
      return this._selectedView()!;
    } else {
      return this.frame()?.views[0]?.viewName ?? 'unknown';
    }
  });

  protected selectedFrameView = computed(() =>
    this.getFrameView(this.selectedView()),
  );
  protected getFrameView(view: string): FrameView | null {
    const frame = this.frame();
    if (!frame) {
      return null;
    }
    return frame.views.find((x) => x.viewName === view) ?? null;
  }
  protected selectedKeypoint = signal<string | null>(null);

  keypointViewModelCache = new WeakMap<LKeypoint[], Keypoint[]>();

  getCachedKeypointViewModels(keypoints: LKeypoint[]): Keypoint[] {
    if (!this.keypointViewModelCache.has(keypoints)) {
      const target = keypoints
        .map((k) => this.buildViewModel(k))
        .filter(
          (keypoint) =>
            !isNaN(keypoint.position().x) && !isNaN(keypoint.position().y),
        );
      this.keypointViewModelCache.set(keypoints, target);
    }
    return this.keypointViewModelCache.get(keypoints)!;
  }
  private buildViewModel(lkeypoint: LKeypoint): Keypoint {
    const val = {
      id: lkeypoint.keypointName,
      hoverText: lkeypoint.keypointName,
      position: signal({ x: lkeypoint.x, y: lkeypoint.y }),
      colorClass: computed(() => {
        if (this.selectedKeypoint() == null) {
          return 'bg-green-500/10';
        }
        if (lkeypoint.keypointName === this.selectedKeypoint()) {
          return 'bg-green-500/20';
        } else {
          return 'bg-green-500/5';
        }
      }),
    };
    return val;
  }

  protected imgPath(kpImgPath: string): string {
    return (
      '/app/v0/files/' +
      this.projectInfoService.projectInfo.data_dir +
      '/' +
      kpImgPath
    );
  }

  protected temporalImgPaths(kpImgPath: string): string[] {
    /* path is like a/b/c/fname000index.ext
     * we want to return the paths where index is replaced with index-2, index -1, index, index+1 in an array.
     * we want to learn the total number of digits in the index (it's zero padded) and maintain it constant.
     * omit negative indices. */

    // Match the pattern: capture everything before the index, the index digits, and the extension
    const match = kpImgPath.match(/^(.+?)(\d+)(\.[^.]+)$/);

    if (!match) {
      return [];
    }

    const [, prefix, indexStr, extension] = match;
    const currentIndex = parseInt(indexStr, 10);
    const numDigits = indexStr.length;

    const result: string[] = [];

    // Generate paths for index-2, index-1, index, index+1
    for (let offset = -2; offset <= 2; offset++) {
      const newIndex = currentIndex + offset;

      // Omit negative indices
      if (newIndex < 0) {
        continue;
      }

      // Pad the new index with zeros to maintain the same number of digits
      const paddedIndex = newIndex.toString().padStart(numDigits, '0');

      // Construct the new path
      const newPath = `${prefix}${paddedIndex}${extension}`;
      result.push(this.imgPath(newPath));
    }

    return result;
  }

  handleViewClickFromFilmstrip(viewName: string) {
    this._selectedView.set(viewName);
    this.selectFirstKeypoint();
  }

  // Set to a random value if you need to bust cache of computed signals.
  private cacheBuster = signal(0);
  /** an overload of `handleKeypointUpdated` that uses viewName: string
   * instead of a reference to frameview. Used for autolabeling */
  private handleKeypointUpdated2(
    keypointName: string,
    viewName: string,
    position: Point,
  ) {
    const frameView = this.getFrameView(viewName)!;
    this.handleKeypointUpdated(keypointName, position, frameView);
  }
  handleKeypointUpdated(
    keypointName: string,
    position: Point,
    frameView: FrameView,
  ) {
    const keypoint = frameView.keypoints.find(
      (kp) => kp.keypointName === keypointName,
    )!;
    const newKp = {
      x: position.x,
      y: position.y,
      keypointName: keypointName,
    };
    // Update domain model.
    frameView.keypoints = frameView.keypoints.map((item) =>
      item === keypoint ? { ...keypoint, ...newKp } : item,
    );
    // Invalidate viewmodel cache.
    this.keypointViewModelCache.delete(frameView.keypoints);

    if (lkp(keypoint).isNaN()) {
      this.selectNextUnlabeledKeypoint(keypointName);
    }
    this.cacheBuster.set(Math.random());
  }

  /** Default NaN Keypoints to edit mode. */
  protected get labelerDefaultsToEditMode(): boolean {
    // TODO: Getting `selectedKeypointInFrame` could be a getter or computed instead.

    const frameView = this.selectedFrameView();
    if (!frameView) return false;
    const selectedKeypoint = this.selectedKeypoint();
    if (!selectedKeypoint) return false;
    const selectedKeypointInFrame = frameView.keypoints.find(
      (kp) => kp.keypointName === selectedKeypoint,
    );
    if (!selectedKeypointInFrame) return false;

    return lkp(selectedKeypointInFrame).isNaN();
  }

  /**
   * Selects the next keypoint that does not have a label in the currently selected frame view.
   */
  private selectNextUnlabeledKeypoint(originKp: string | null) {
    const frameView = this.selectedFrameView();

    if (frameView) {
      const startIdx =
        originKp === null
          ? 0
          : frameView.keypoints.findIndex((kp) => kp.keypointName === originKp);
      for (let i = startIdx + 1; i < frameView.keypoints.length; i++) {
        const kp = frameView.keypoints[i];
        if (lkp(kp).isNaN()) {
          this.selectedKeypoint.set(kp.keypointName);
          return;
        }
      }
    }
  }

  protected handleKeypointClearClick(kp: LKeypoint) {
    if (this.selectedFrameView()) {
      this.handleKeypointUpdated(
        kp.keypointName,
        { x: NaN, y: NaN },
        this.selectedFrameView()!,
      );
    }
  }

  protected get saveTooltip(): string {
    if (!this.isSaveDisabled()) return '';
    return 'No changes to save.';
  }

  protected get saveAndContinueTooltip(): string {
    if (!this.isSaveDisabled())
      return 'Save and advance to next frame or view.';
    return 'No changes to save.';
  }

  // export to template
  protected readonly mvf = mvf;

  private sessionService = inject(SessionService);
  private abortController = new AbortController();
  protected isSaving = signal(false);
  private isMVAutoLabeling = signal(false);
  protected hasCameraCalibrationFiles = signal(false);
  protected disableInteractions = computed(() => {
    this.cacheBuster();

    return !this.frame() || this.isSaving() || this.isMVAutoLabeling();
  });

  protected isSaveDisabled = computed(() => {
    this.cacheBuster();
    return (
      !this.frame() ||
      this.disableInteractions() ||
      !mvf(this.frame()!).hasChanges
    );
  });

  newLabelFile = output();

  protected deleteConfirmationDialog = viewChild<ElementRef<HTMLDialogElement>>(
    'deleteConfirmationDialog',
  );
  protected deletionShouldContinue = new Subject<boolean>();
  protected isShowingTemporalContext = signal<boolean>(false);
  protected readonly temporalContextIndex = signal<number | null>(null);

  protected async handleSaveClick(
    labelFile: MVLabelFile,
    frame: MVFrame,
    shouldContinue: boolean,
    deletion?: boolean,
  ) {
    if (deletion) {
      this.deleteConfirmationDialog()!.nativeElement.showModal();
      if (!(await firstValueFrom(this.deletionShouldContinue.asObservable())))
        return;
    }

    this.isSaving.set(true);
    const frameView = this.selectedFrameView()!;
    const nextFrameView = frame.views[frame.views.indexOf(frameView) + 1];

    this.sessionService
      .saveMVFrame(labelFile, frame, deletion)
      .then(() => {
        this.isSaving.set(false);
        this.saved.emit({
          labelFile,
          frame,
          // If save and next button clicked, and there is no next view, go to the next frame.
          shouldAdvanceFrame: shouldContinue && !nextFrameView,
          deletion,
        });
        this.toastService.showToast({ content: 'Saved successfully' });
        // If save and next button clicked and there is a next view, select it.
        if (shouldContinue && nextFrameView) {
          this._selectedView.set(nextFrameView.viewName);
        }
        this.selectFirstKeypoint();
      })
      .catch((error) => {
        this.isSaving.set(false);
        throw new Error(error);
      });
  }

  protected handleMVAutoLabelClick(labelFile: MVLabelFile, frame: MVFrame) {
    this.isMVAutoLabeling.set(true);
    const abortSignal = this.abortController.signal;
    const sessionKey = mvf(frame).autolabelSessionKey;
    if (!sessionKey) {
      return;
    }
    this.sessionService
      .mvAutoLabel(frame, sessionKey)
      .then((response: GetMVAutoLabelsResponse) => {
        this.isMVAutoLabeling.set(false);
        if (abortSignal.aborted) return;
        // Patch keypoints with projections from response.
        response.keypoints.forEach((kp) => {
          if (!kp.projections) return;
          kp.projections.forEach((proj) => {
            const projectedPoint = proj.projectedPoint;
            // Skip because there were not enough labeled views to autolabel.
            if (!projectedPoint) return;
            // If this is present, the original point was already labeled.
            if (proj.originalPoint) return;
            this.handleKeypointUpdated2(kp.keypointName, proj.view, {
              x: projectedPoint.x,
              y: projectedPoint.y,
            });
          });
        });
        this.toastService.showToast({
          content: 'Success: keypoints have been labeled wherever possible.',
        });
      })
      .catch((error) => {
        this.isMVAutoLabeling.set(false);
        throw error;
      });
  }

  protected handleDeleteConfirmationDialogContinuation(
    shouldContinue: boolean,
  ) {
    this.deleteConfirmationDialog()!.nativeElement.close();
    this.deletionShouldContinue.next(shouldContinue);
  }

  protected handleShowTemporalContextClick() {
    this.temporalContextAbortController = new AbortController();

    this.isShowingTemporalContext.set(true);
    this.beginTemporalContextLoop(this.temporalContextAbortController.signal);
  }
  protected handleStopTemporalContextClick() {
    this.temporalContextAbortController?.abort();
    this.isShowingTemporalContext.set(false);
  }
  private beginTemporalContextLoop(abortSignal: AbortSignal) {
    let direction = 1;
    const loop = async () => {
      while (!abortSignal.aborted) {
        this.temporalContextIndex.update((index) => {
          const currentIndex = index ?? -1;
          let nextIndex = currentIndex + direction;

          if (nextIndex > 4) {
            direction = -1;
            nextIndex = 3;
          } else if (nextIndex <= 0) {
            direction = 1;
            nextIndex = 0;
          }

          return nextIndex;
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    };
    loop();
  }
}
