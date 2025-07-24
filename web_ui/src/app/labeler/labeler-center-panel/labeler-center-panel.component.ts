import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FrameView, MVFrame } from '../frame.model';
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

  kpAdapterWM = new WeakMap<LKeypoint[], Keypoint[]>();
  kpAdapter(keypoints: LKeypoint[]): Keypoint[] {
    if (!this.kpAdapterWM.has(keypoints)) {
      const target = keypoints
        .map(this.convertKeypoint.bind(this))
        .filter(
          (keypoint) =>
            !isNaN(keypoint.position().x) && !isNaN(keypoint.position().y),
        );
      this.kpAdapterWM.set(keypoints, target);
    }
    return this.kpAdapterWM.get(keypoints)!;
  }
  private convertKeypoint(lkeypoint: LKeypoint): Keypoint {
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
}
