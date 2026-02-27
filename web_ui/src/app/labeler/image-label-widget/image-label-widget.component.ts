import {
  Component,
  OnInit,
  OnDestroy,
  input,
  output,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
  inject,
  model,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { KeypointContainerComponent } from '../../components/keypoint-container/keypoint-container.component';
import { ZoomableContentComponent } from '../../components/zoomable-content.component';
import { FrameView } from '../frame.model';
import { LKeypoint, lkp } from '../types';
import { Keypoint } from '../../keypoint';
import { ProjectInfoService } from '../../project-info.service';
import { Point } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-image-label-widget',
  standalone: true,
  imports: [CommonModule, KeypointContainerComponent, ZoomableContentComponent],
  templateUrl: './image-label-widget.component.html',
  styles: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageLabelWidgetComponent {
  private projectInfoService = inject(ProjectInfoService);

  fv = input.required<FrameView>();
  selectedKeypoint = model<string | null>(null);
  isShowingTemporalContext = input<boolean>(false);
  temporalContextIndex = input<number | null>(null);
  imgCssFilterString = input<string>('');
  disableInteractions = input<boolean>(false);
  zoomableInteractivityDisabled = input<boolean>(false);

  keypointUpdated = output<{
    kp: string;
    position: Point;
  }>();

  private keypointViewModelCache = new WeakMap<LKeypoint[], Keypoint[]>();

  zoomableContent = viewChild<ZoomableContentComponent>('primaryZoomable');

  protected get labelerDefaultsToEditMode(): boolean {
    const frameView = this.fv();
    const selectedKeypoint = this.selectedKeypoint();
    if (!selectedKeypoint) return false;
    const selectedKeypointInFrame = frameView.keypoints.find(
      (kp) => kp.keypointName === selectedKeypoint,
    );
    if (!selectedKeypointInFrame) return false;

    return lkp(selectedKeypointInFrame).isNaN();
  }

  protected getCachedKeypointViewModels(keypoints: LKeypoint[]): Keypoint[] {
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

  protected handleKeypointUpdated(keypointName: string, position: Point) {
    this.keypointUpdated.emit({ kp: keypointName, position });
  }
}
