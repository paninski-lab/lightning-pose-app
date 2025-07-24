import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Host,
  Injectable,
  input,
  Optional,
  signal,
  Signal,
} from '@angular/core';
import { CdkDragEnd, DragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Keypoint } from '../../keypoint';
import { VideoTileComponent } from '../video-player/video-tile/video-tile.component';

/**
 * Hack to override dragStartThreshold to 0.
 */
@Injectable()
class CustomDragDrop extends DragDrop {
  override createDrag<T = any>(element: any, config: any): any {
    const modifiedConfig = {
      ...config,
      dragStartThreshold: 0,
    };
    return super.createDrag<T>(element, modifiedConfig);
  }
}

/**
 * KeypointContainerComponent is responsible for displaying a collection
 * of keypoints.
 *
 * LabelingMode (WIP) makes points draggable. Currently we update the keypoint
 * model position when the dragging has ended, not during dragging.
 * (Updating the position while dragging caused issues with the underlying cdkDrag machinery.)
 */
@Component({
  selector: 'app-keypoint-container',
  imports: [DragDropModule],
  templateUrl: './keypoint-container.component.html',
  styleUrl: './keypoint-container.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: DragDrop, useClass: CustomDragDrop }],
})
export class KeypointContainerComponent {
  labelerMode = input<boolean>(false);
  keypointModels = input.required<Keypoint[]>();
  useCrossHairs = input(false);
}
