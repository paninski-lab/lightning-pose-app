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
import { ZoomableContentComponent } from '../../sandbox/zoomable-content.component';
import { KeypointContainerComponent } from '../../components/keypoint-container/keypoint-container.component';
import { Keypoint } from '../../keypoint';
import { ProjectInfoService } from '../../project-info.service';

@Component({
  selector: 'app-labeler-center-panel',
  imports: [DecimalPipe, ZoomableContentComponent, KeypointContainerComponent],
  templateUrl: './labeler-center-panel.component.html',
  styleUrl: './labeler-center-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerCenterPanelComponent implements OnInit {
  private projectInfoService = inject(ProjectInfoService);
  frame = input<MVFrame | null>(null);

  save = output<SaveActionData>();
  protected selectedView = signal('lTop');
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

  ngOnInit() {
    /** Default to the first view in the frame */
    const views = this.frame()?.views;
    if (views) {
      this.selectedView.set(views[0].viewName);
    }
  }

  kpAdapterWM = new WeakMap<LKeypoint[], Keypoint[]>();
  kpAdapter(keypoints: LKeypoint[]): Keypoint[] {
    if (!this.kpAdapterWM.has(keypoints)) {
      const target = keypoints.map(this._kpAdapter);
      this.kpAdapterWM.set(keypoints, target);
    }
    return this.kpAdapterWM.get(keypoints)!;
  }
  _kpAdapter(lkeypoint: LKeypoint): Keypoint {
    const val = {
      id: lkeypoint.keypointName,
      hoverText: lkeypoint.keypointName,
      position: signal({ x: lkeypoint.x, y: lkeypoint.y }),
      colorClass: signal('bg-green-500/30'),
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
}
