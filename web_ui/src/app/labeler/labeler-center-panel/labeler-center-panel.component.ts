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
import { FrameView, mvf, MVFrame } from '../frame.model';
import { LKeypoint, lkp } from '../types';
import { DecimalPipe } from '@angular/common';
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
import { FormsModule } from '@angular/forms';
import { ImageLabelWidgetComponent } from '../image-label-widget/image-label-widget.component';

@Component({
  selector: 'app-labeler-center-panel',
  imports: [
    DecimalPipe,
    HorizontalScrollDirective,
    PathPipe,
    BundleAdjustDialogComponent,
    FormsModule,
    ImageLabelWidgetComponent,
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

  labelFile = input<MVLabelFile | null>(null);
  frame = input<MVFrame | null>(null);
  numLabeledFramesGetter = input.required<() => number>();

  primaryZoomableElement =
    viewChild<ImageLabelWidgetComponent>('primaryZoomable');

  saved = output<{
    labelFile: MVLabelFile;
    frame: MVFrame;
    shouldAdvanceFrame: boolean;
    deletion?: boolean;
  }>();

  constructor() {
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
      this.hasCameraCalibrationFiles.set(false);
      this.checkIfHasCameraCalibrationFiles();
    }

    if (changes['frame']) {
      // Reset scale.
      if (this.primaryZoomableElement()?.zoomableContent()) {
        this.primaryZoomableElement()!
          .zoomableContent()!
          .fitContentToViewport();
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
}
