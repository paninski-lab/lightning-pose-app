import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Input,
  input,
  OnChanges,
  output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FrameView, fv, mvf, MVFrame, MVFUtils } from '../frame.model';
import { LKeypoint, lkp, SaveActionData } from '../types';
import { DecimalPipe } from '@angular/common';
import { ZoomableContentComponent } from '../../components/zoomable-content.component';
import { KeypointContainerComponent } from '../../components/keypoint-container/keypoint-container.component';
import { Keypoint } from '../../keypoint';
import { ProjectInfoService } from '../../project-info.service';
import { HorizontalScrollDirective } from '../../components/horizontal-scroll.directive';
import { Point } from '@angular/cdk/drag-drop';
import { SessionService } from '../../session.service';
import { MVLabelFile } from '../../label-file.model';

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
export class LabelerCenterPanelComponent implements OnChanges {
  private projectInfoService = inject(ProjectInfoService);

  labelFile = input<MVLabelFile | null>(null);
  frame = input<MVFrame | null>(null);

  save = output<SaveActionData>();

  ngOnChanges(changes: SimpleChanges) {
    // Unlabeled frames should start at the first unlabeled keypoint.
    if (
      changes['frame'] &&
      this.frame() &&
      mvf(this.frame()!).isFromUnlabeledSet
    ) {
      // Reset state
      this._selectedView.set(null);
      this.selectedKeypoint.set(
        this.selectedFrameView()?.keypoints[0]?.keypointName ?? null,
      );
    }
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

  handleViewClickFromFilmstrip(viewName: string) {
    this._selectedView.set(viewName);
  }

  // Set to a random value if you need to bust cache of computed signals.
  private cacheBuster = signal(0);
  handleKeypointUpdated(kpName: string, position: Point, frameView: FrameView) {
    const keypointName = kpName;

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
      return 'Save and advance to next unlabeled frame.';
    return 'No changes to save.';
  }

  // export to template
  protected readonly mvf = mvf;

  private sessionService = inject(SessionService);
  private isSaving = signal(false);
  protected disableInteractions = computed(() => {
    this.cacheBuster();

    return !this.frame() || this.isSaving();
  });

  protected isSaveDisabled = computed(() => {
    return (
      !this.frame() ||
      this.disableInteractions() ||
      !mvf(this.frame()!).hasChanges
    );
  });

  protected handleSaveClick(labelFile: MVLabelFile, frame: MVFrame) {
    this.isSaving.set(true);
    this.sessionService
      .saveMVFrame(labelFile, frame)
      .then(() => {
        // this.save.emit({});
        this.isSaving.set(false);
        // on error, we just reset the loading state
      })
      .catch((error) => {
        this.isSaving.set(false);
        throw error;
      });
  }
}
