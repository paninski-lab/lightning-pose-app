import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabelerViewOptionsService } from '../labeler-view-options.service';
import { KeypointContainerComponent } from '../../components/keypoint-container/keypoint-container.component';
import { ZoomableContentComponent } from '../../components/zoomable-content.component';
import { ViewportContextDirective } from '../../components/viewport-context.directive';
import { FrameView } from '../frame.model';
import { LKeypoint, lkp } from '../types';
import { Keypoint } from '../../keypoint';
import { ProjectInfoService } from '../../project-info.service';
import { Point } from '@angular/cdk/drag-drop';
import { ColorService } from '../../infra/color.service';

@Component({
  selector: 'app-image-label-widget',
  standalone: true,
  imports: [
    CommonModule,
    KeypointContainerComponent,
    ZoomableContentComponent,
    ViewportContextDirective,
  ],
  templateUrl: './image-label-widget.component.html',
  styles: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageLabelWidgetComponent {
  private projectInfoService = inject(ProjectInfoService);
  protected viewOptions = inject(LabelerViewOptionsService);
  private colorService = inject(ColorService);

  fv = input.required<FrameView>();
  selectedKeypoint = model<string | null>(null);
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
      size: computed(() =>
        this.colorService.getKeypointSize(lkeypoint.keypointName),
      ),
      color: computed(() => {
        let alpha = this.viewOptions.keypointOpacity();
        if (this.selectedKeypoint() != null) {
          if (lkeypoint.keypointName === this.selectedKeypoint()) {
            alpha = Math.min(1, alpha + 0.15);
          } else {
            alpha = Math.max(0, alpha - 0.05);
          }
        }
        //return `color-mix(in oklab, oklch(72.3% 0.219 149.579) ${alpha * 100}%, transparent)`;
        return `rgba(${this.colorService.getKeypointColor(lkeypoint.keypointName).slice(0, 3).join(', ')}, ${alpha})`;
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
