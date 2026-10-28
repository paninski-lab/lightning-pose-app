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
import { LabelerViewOptionsService } from '../labeler-view-options.service';
import { FrameView, fv, mvf, MVFrame } from '../frame.model';
import { LKeypoint, lkp } from '../types';
import { DecimalPipe } from '@angular/common';
import { ProjectInfoService } from '../../project-info.service';
import { HorizontalScrollDirective } from '../../infra/horizontal-scroll.directive';
import { Point } from '@angular/cdk/drag-drop';
import { SessionService } from '../../session.service';
import { CameraCalibrationService } from '../../camera-calibration.service';
import { MVLabelFile } from '../../label-file.model';
import { GetMVAutoLabelsResponse } from '../mv-autolabel';
import { BundleAdjustDialogComponent } from '../../bundle-adjust-dialog/bundle-adjust-dialog.component';
import { PathDisplayComponent } from '../../components/path-display/path-display.component';
import { ToastService } from '../../toast.service';
import { firstValueFrom, Subject } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ImageLabelWidgetComponent } from '../image-label-widget/image-label-widget.component';
import {
  CONTEXT_SLOT_LABELS,
  contextImgPaths,
  contextShowingText,
} from '../temporal-context';
import { LoadCalibrationDialogComponent } from '../../file-manager/load-calibration-dialog.component';
import { SkeletonViewOptionsComponent } from '../../components/skeleton-view-options/skeleton-view-options.component';
import {
  isSkeletonDefinitionInvalid,
  skeletonPairs,
} from '../../components/skeleton-overlay/skeleton-validity';
import { SplitAreaComponent, SplitComponent } from 'angular-split';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../../components/dropdown/dropdown.component';

@Component({
  selector: 'app-labeler-center-panel',
  imports: [
    DecimalPipe,
    HorizontalScrollDirective,
    BundleAdjustDialogComponent,
    FormsModule,
    ImageLabelWidgetComponent,
    PathDisplayComponent,
    SkeletonViewOptionsComponent,
    LoadCalibrationDialogComponent,
    SplitComponent,
    SplitAreaComponent,
    DropdownComponent,
    DropdownContentComponent,
    DropdownTriggerComponent,
    DropdownTriggerDirective,
  ],
  providers: [LabelerViewOptionsService],
  templateUrl: './labeler-center-panel.component.html',
  styleUrl: './labeler-center-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerCenterPanelComponent implements OnChanges {
  private projectInfoService = inject(ProjectInfoService);
  private toastService = inject(ToastService);
  protected viewOptions = inject(LabelerViewOptionsService);
  protected skeletonInvalid = computed(() => {
    const info = this.projectInfoService.projectContext()?.projectInfo;
    if (!info) return false;
    return isSkeletonDefinitionInvalid(info.skeleton, info.keypoint_names);
  });
  protected noSkeletonPairs = computed(
    () =>
      skeletonPairs(this.projectInfoService.projectContext()?.projectInfo?.skeleton)
        .length === 0,
  );
  protected isMultiview = computed(() => {
    return (
      (this.projectInfoService.projectContext()?.projectInfo?.views?.length ??
        0) > 0
    );
  });

  labelFile = input<MVLabelFile | null>(null);
  frame = input<MVFrame | null>(null);
  hasNextFrame = input(false);
  hasPreviousFrame = input(false);
  numLabeledFramesGetter = input.required<() => number>();

  primaryZoomableElement =
    viewChild<ImageLabelWidgetComponent>('primaryZoomable');

  saved = output<{
    labelFile: MVLabelFile;
    frame: MVFrame;
    shouldAdvanceFrame: boolean;
    deletion?: boolean;
  }>();
  nextFrame = output<void>();
  previousFrame = output<void>();
  closeFrame = output<void>();

  constructor() {
    // The controls are disabled without context, so stop playback and show
    // the current frame (with keypoints) rather than leave it running.
    effect(() => {
      if (!this.hasTemporalContext()) {
        untracked(() => this.viewOptions.resetTemporalContext());
      }
    });

    effect(() => {
      this.selectedView();

      // Reset scale when view changes.
      // Use untracked() to avoid creating a dependency on primaryZoomableElement
      untracked(() => {
        if (this.primaryZoomableElement()?.zoomableContent()) {
          this.primaryZoomableElement()!
            .zoomableContent()!
            .fitContentToViewport();
        }
      });
    });
  }
  ngOnChanges(changes: SimpleChanges) {
    if (changes['frame']) {
      this.abortController.abort();
      this.abortController = new AbortController();
      this.calibrationStatus.set('none');
      this.checkIfHasCameraCalibrationFiles();
    }

    if (changes['frame']) {
      // A new frame opens on itself, with keypoints shown.
      this.viewOptions.resetTemporalContext();

      // Reset scale.
      if (this.primaryZoomableElement()?.zoomableContent()) {
        this.primaryZoomableElement()!
          .zoomableContent()!
          .fitContentToViewport();
      }
    }

    // A frame reached by Back opens on its last view. Unlabeled frames, and
    // a frame reached by Next or Save and next, start from the first view.
    if (changes['frame'] && this.frame()) {
      const openOn = this.openFrameOn;
      this.openFrameOn = null;
      if (openOn === 'last') {
        this._selectedView.set(this.frame()!.views.at(-1)?.viewName ?? null);
        this.selectKeypointForView();
      } else if (openOn === 'first' || mvf(this.frame()!).isFromUnlabeledSet) {
        this._selectedView.set(null);
        this.selectKeypointForView();
      }
    }
  }

  /**
   * Which view the next frame opens on: 'first' after Next or Save and next
   * leaves the last view, 'last' after Back leaves the first view.
   */
  private openFrameOn: 'first' | 'last' | null = null;

  /**
   * Selects the keypoint for a newly shown view: the same keypoint when
   * "Keep selected keypoint" is on and the view has it, otherwise the first.
   */
  private selectKeypointForView() {
    const keypoints = this.selectedFrameView()?.keypoints ?? [];
    const current = this.selectedKeypoint();
    if (
      this.viewOptions.keepSelectedKeypoint() &&
      keypoints.some((kp) => kp.keypointName === current)
    ) {
      return;
    }
    this.selectedKeypoint.set(keypoints[0]?.keypointName ?? null);
  }

  protected sessionKey = computed(() => {
    const frame = this.frame();
    if (!frame) return null;
    return mvf(frame).autolabelSessionKey;
  });

  private checkIfHasCameraCalibrationFiles() {
    const abortSignal = this.abortController.signal;
    const sessionKey = this.sessionKey();
    if (!sessionKey) return;
    this.cameraCalibrationService.getCalibrationStatus(sessionKey).then((status) => {
      if (abortSignal.aborted) return;
      this.calibrationStatus.set(status);
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
  protected contextSlotLabels = CONTEXT_SLOT_LABELS;
  /** Why temporal context can't be shown for the selected image, or null when it can. */
  protected temporalContextUnavailableReason = computed((): string | null => {
    const frameView = this.selectedFrameView();
    if (!frameView) return null;
    // LP builds no context when the file name has no frame number.
    if (contextImgPaths(frameView.imgPath) === null) {
      return 'The image file name has no frame number.';
    }
    const frameMessage = this.primaryZoomableElement()?.currentFrameMessage();
    if (frameMessage) return frameMessage;
    if (this.primaryZoomableElement()?.contextFramesMissing()) {
      return 'Context frames were not found.';
    }
    return null;
  });
  /** "Showing: …" text, naming the frame actually shown when a slot shows a substitute. */
  protected contextShowingText = computed(() => {
    const slot = this.viewOptions.temporalContextIndex();
    const views = this.primaryZoomableElement()?.contextSlotViews();
    return contextShowingText(slot, views?.[slot]);
  });
  protected hasTemporalContext = computed(
    () => !!this.selectedFrameView() && !this.temporalContextUnavailableReason(),
  );
  protected getFrameView(view: string): FrameView | null {
    const frame = this.frame();
    if (!frame) {
      return null;
    }
    return frame.views.find((x) => x.viewName === view) ?? null;
  }
  protected selectedKeypoint = signal<string | null>(null);

  handleViewClickFromFilmstrip(viewName: string) {
    this._selectedView.set(viewName);
    this.selectKeypointForView();
  }

  // Set to a random value if you need to bust cache of computed signals.
  protected cacheBuster = signal(0);
  protected loadCalibrationOpen = signal(false);
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

    if (lkp(keypoint).isNaN()) {
      this.selectNextUnlabeledKeypoint(keypointName);
    }
    this.cacheBuster.set(Math.random());
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

  // export to template
  protected readonly mvf = mvf;

  private sessionService = inject(SessionService);
  private cameraCalibrationService = inject(CameraCalibrationService);
  private abortController = new AbortController();
  protected isSaving = signal(false);
  private isMVAutoLabeling = signal(false);
  protected calibrationStatus = signal<'session' | 'project' | 'none'>('none');
  protected hasCameraCalibrationFiles = computed(
    () => this.calibrationStatus() !== 'none',
  );
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

  protected hasNextView = computed(() => !!this.nextFrameView());

  private nextFrameView = computed(() => this.frameViewAtOffset(1));
  private previousFrameView = computed(() => this.frameViewAtOffset(-1));

  private frameViewAtOffset(offset: number): FrameView | null {
    const frame = this.frame();
    const frameView = this.selectedFrameView();
    if (!frame || !frameView) return null;
    return frame.views[frame.views.indexOf(frameView) + offset] ?? null;
  }

  /** Next is active when there is another view of this frame or another frame. */
  protected isNextDisabled = computed(
    () =>
      (!this.hasNextView() && !this.hasNextFrame()) ||
      this.disableInteractions(),
  );

  /** Back is active when there is an earlier view of this frame or an earlier frame. */
  protected isBackDisabled = computed(
    () =>
      (!this.previousFrameView() && !this.hasPreviousFrame()) ||
      this.disableInteractions(),
  );

  /** Clear view is active when the selected view has a placed keypoint. */
  protected canClearView = computed(() => {
    this.cacheBuster();
    const frameView = this.selectedFrameView();
    return (
      !!frameView &&
      !this.disableInteractions() &&
      fv(frameView).hasPlacedKeypoints
    );
  });

  protected isSaveAndNextDisabled = computed(() => {
    return (
      this.isSaveDisabled() || (!this.hasNextView() && !this.hasNextFrame())
    );
  });

  protected canRevert = computed(() => {
    this.cacheBuster();
    const frame = this.frame();
    if (!frame || this.disableInteractions()) return false;
    return mvf(frame).hasRevertibleEdits;
  });

  // Frame buttons have a tooltip only while inactive, saying why.
  private busyReason = computed(() => {
    if (this.isSaving()) return 'Saving…';
    if (this.isMVAutoLabeling()) return 'Labeling the other views…';
    return '';
  });

  protected saveDisabledReason = computed(() => {
    if (!this.isSaveDisabled()) return '';
    return this.busyReason() || 'No changes to save.';
  });

  protected saveAndNextDisabledReason = computed(() => {
    if (!this.isSaveAndNextDisabled()) return '';
    return this.saveDisabledReason() || 'Already on the last view of the last frame.';
  });

  protected backDisabledReason = computed(() => {
    if (!this.isBackDisabled()) return '';
    return this.busyReason() || 'Already on the first view of the first frame.';
  });

  protected nextDisabledReason = computed(() => {
    if (!this.isNextDisabled()) return '';
    return this.busyReason() || 'Already on the last view of the last frame.';
  });

  protected revertDisabledReason = computed(() => {
    if (this.canRevert()) return '';
    return this.busyReason() || 'No changes to revert.';
  });

  protected removeFrameTooltip(): string {
    const frame = this.frame();
    if (frame && mvf(frame).isFromUnlabeledSet) {
      return 'Remove frame from labeling queue';
    }
    return 'Remove frame from label file';
  }

  /** Shows the next view of this frame, or the next frame from the last view. Does not save. */
  protected handleNext() {
    if (this.isNextDisabled()) return;
    const nextView = this.nextFrameView();
    if (nextView) {
      this._selectedView.set(nextView.viewName);
      this.selectKeypointForView();
      return;
    }
    this.openFrameOn = 'first';
    this.nextFrame.emit();
  }

  /** Shows the previous view of this frame, or the last view of the previous frame from the first view. Does not save. */
  protected handleBack() {
    if (this.isBackDisabled()) return;
    const previousView = this.previousFrameView();
    if (previousView) {
      this._selectedView.set(previousView.viewName);
      this.selectKeypointForView();
      return;
    }
    this.openFrameOn = 'last';
    this.previousFrame.emit();
  }

  /** Unplaces every keypoint in the selected view. Not saved until Save; Revert undoes it. */
  protected handleClearView() {
    const frameView = this.selectedFrameView();
    if (!frameView || !this.canClearView()) return;
    fv(frameView).clearKeypoints();
    this.selectKeypointForView();
    this.cacheBuster.set(Math.random());
  }

  protected handleRevert() {
    const frame = this.frame();
    if (!frame || this.disableInteractions() || !mvf(frame).hasRevertibleEdits) {
      return;
    }
    mvf(frame).revertEdits();
    this.cacheBuster.set(Math.random());
  }

  protected onCalibrationLoadDone(saved: boolean) {
    this.loadCalibrationOpen.set(false);
    if (saved) this.checkIfHasCameraCalibrationFiles();
  }

  newLabelFile = output();

  protected deleteConfirmationDialog = viewChild<ElementRef<HTMLDialogElement>>(
    'deleteConfirmationDialog',
  );
  protected deletionShouldContinue = new Subject<boolean>();

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
    const nextFrameView = this.nextFrameView();

    this.sessionService
      .saveMVFrame(labelFile, frame, deletion)
      .then(() => {
        this.isSaving.set(false);
        if (shouldContinue && !nextFrameView) {
          this.openFrameOn = 'first';
        }
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
        this.selectKeypointForView();
      })
      .catch((error) => {
        this.isSaving.set(false);
        throw error;
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
}
