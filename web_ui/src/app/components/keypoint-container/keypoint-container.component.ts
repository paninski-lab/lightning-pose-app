import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Host,
  Injectable,
  input,
  Optional,
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

  protected scaledKeypointModels: Signal<Keypoint[]>;

  constructor(@Optional() @Host() public parent?: VideoTileComponent) {
    if (!parent) {
      // this should never happen
      alert(
        'KeypointContainerComponent must be used inside a VideoTileComponent for now.',
      );
      throw new Error(
        'KeypointContainerComponent must be used inside a VideoTileComponent for now.',
      );
    }
    this.scaledKeypointModels = computed(() => {
      return this.keypointModels().map((k) => {
        return {
          ...k,
          position: computed(() => {
            return {
              x: k.position().x * parent.scaleFactor(),
              y: k.position().y * parent.scaleFactor(),
            };
          }),
        };
      });
    });
  }

  protected onKeypointDragEnd(keypointModel: Keypoint, event: CdkDragEnd) {
    const cdkPosition = event.source.getFreeDragPosition();
    //keypointModel.position.set(cdkPosition);
  }
}
