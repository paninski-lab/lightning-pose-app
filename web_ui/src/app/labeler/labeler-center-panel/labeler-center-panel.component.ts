import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FrameView, fv, MVFrame } from '../frame.model';
import { LKeypoint, SaveActionData } from '../types';
import { DecimalPipe } from '@angular/common';
import { ZoomableContentComponent } from '../../components/zoomable-content.component';
import { KeypointContainerComponent } from '../../components/keypoint-container/keypoint-container.component';
import { Keypoint } from '../../keypoint';
import { ProjectInfoService } from '../../project-info.service';
import { HorizontalScrollDirective } from '../../components/horizontal-scroll.directive';

@Component({
  selector: 'app-labeler-center-panel',
  imports: [
    DecimalPipe,
    ZoomableContentComponent,
    KeypointContainerComponent,
    HorizontalScrollDirective,
  ],
  templateUrl: './labeler-center-panel.component.html',
  styleUrl: './labeler-center-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerCenterPanelComponent {
  private projectInfoService = inject(ProjectInfoService);

  /**
   * The keypoints in the currently-opened label file.
   *
   * A frame-view may omit some of these keypoints (meaning it's not yet fully labeled),
   * but it would never have keypoints that are not in the `allKeypoints` array.
   */
  allKeypoints = input.required<string[]>();

  frame = input<MVFrame | null>(null);

  save = output<SaveActionData>();

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

  handleViewClickFromFilmstrip(viewName: string) {
    this._selectedView.set(viewName);
  }

  handleKeypointUpdated(keypoint: Keypoint, frameView: FrameView) {
    // updateKeypointDataStructure()
    // nextInWorkflow

    const underlyingKp = frameView.keypoints.find(
      ({ keypointName }) => keypointName === keypoint.id,
    );
    const newKp = {
      x: keypoint.position().x,
      y: keypoint.position().y,
      keypointName: keypoint.id,
    };
    // Update domain model.
    if (!underlyingKp) {
      frameView.keypoints = [...frameView.keypoints, newKp];
    } else {
      frameView.keypoints = frameView.keypoints.map((item) =>
        item === underlyingKp ? { ...underlyingKp, ...newKp } : item,
      );
    }
    // Invalidate viewmodel cache.
    this.keypointViewModelCache.delete(frameView.keypoints);

    if (fv(frameView).isFromUnlabeledSet) {
      this.selectNextUnlabeledKeypoint();
    }
  }
  protected labelerDefaultsToEditMode = computed((): boolean => {
    const frameView = this.selectedFrameView();
    if (!frameView) return false;
    return (
      fv(frameView).isFromUnlabeledSet &&
      this.selectedKeypoint() !== null &&
      frameView.keypoints.length < this.allKeypoints().length
    );
  });
  /**
   * updateWorkflowState:
   *   - for unlabeled frames, we should automatically select next keypoint.
   *   - edit mode = true.
   *
   *   saveButtonShown = () => this.hasChanges;
   *
   *   saveButtonEnabled = computed(() => {
   *     if (fv.originalKeypoints.length === 0) {
   *       mvf.views.all((fv) => {
   *         return fv.keypoints.length === total;
   *       });
   *     } else {
   *      return hasChanges;
   *   });
   *

   */
  /**
   * Selects the next keypoint that does not have a label in the currently selected frame view.
   * If all keypoints in the current view are labeled, it advances to the next view
   * and repeats the check. It cycles through keypoints and views as needed.
   * If all keypoints across all views are labeled, selectedKeypoint is set to null.
   */
  selectNextUnlabeledKeypoint() {
    const allKeypoints = this.allKeypoints();
    const frame = this.frame();

    if (
      !allKeypoints ||
      allKeypoints.length === 0 ||
      !frame ||
      frame.views.length === 0
    ) {
      this.selectedKeypoint.set(null); // No keypoints or views to process
      return;
    }

    const views = frame.views;
    const currentSelectedViewName = this.selectedView();
    const currentSelectedKeypointName = this.selectedKeypoint();

    let startViewIdx = views.findIndex(
      (v) => v.viewName === currentSelectedViewName,
    );
    if (startViewIdx === -1) {
      startViewIdx = 0; // Default to first view if current not found
    }

    let startKeypointIdx = allKeypoints.findIndex(
      (kp) => kp === currentSelectedKeypointName,
    );
    if (startKeypointIdx === -1) {
      startKeypointIdx = 0; // Default to first keypoint if current not found
    }

    // Iterate through all views, starting from the current selected one and cycling
    for (let viewOffset = 0; viewOffset < views.length; viewOffset++) {
      const currentViewIdx = (startViewIdx + viewOffset) % views.length;
      const currentView = views[currentViewIdx];
      const currentFrameView = this.getFrameView(currentView.viewName);

      if (!currentFrameView) {
        // If a view doesn't have a corresponding FrameView, skip it and check the next one
        continue;
      }

      // Create a Set for efficient lookup of labeled keypoints in the current view
      const labeledKeypointNamesInCurrentView = new Set(
        currentFrameView.keypoints.map((kp) => kp.keypointName),
      );

      // Iterate through all keypoints, starting from the current selected one (for the first view iteration)
      // or from the beginning (for subsequent view iterations), and cycling
      for (
        let keypointOffset = 0;
        keypointOffset < allKeypoints.length;
        keypointOffset++
      ) {
        // For the first view iteration, start from startKeypointIdx.
        // For subsequent views, always start from index 0 of allKeypoints.
        const effectiveKeypointStartIdx =
          viewOffset === 0 ? startKeypointIdx : 0;
        const currentKeypointIdx =
          (effectiveKeypointStartIdx + keypointOffset) % allKeypoints.length;
        const keypoint = allKeypoints[currentKeypointIdx];

        // Check if this keypoint is unlabeled in the current frame view
        if (!labeledKeypointNamesInCurrentView.has(keypoint)) {
          this.selectedKeypoint.set(keypoint);
          this._selectedView.set(currentView.viewName);
          return; // Found an unlabeled keypoint, exit the method
        }
      }
    }

    // If the loops complete, it means all keypoints across all views are labeled
    this.selectedKeypoint.set(null);
  }
}
