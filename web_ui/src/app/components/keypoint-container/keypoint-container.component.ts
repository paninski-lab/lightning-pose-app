import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Keypoint } from '../../keypoint';
import { Point } from '@angular/cdk/drag-drop';

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
  //imports: [DragDropModule],
  templateUrl: './keypoint-container.component.html',
  styleUrl: './keypoint-container.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  //providers: [{ provide: DragDrop, useClass: CustomDragDrop }],
})
export class KeypointContainerComponent {
  labelerMode = input<boolean>(false);
  keypointModels = input.required<Keypoint[]>();
  useCrossHairs = input(false);

  selectedKeypoint = model<string | null>(null);
  newKpTemplate = input<null | Partial<Keypoint>>(null);
  keypointAdded = output<Keypoint>();

  private containerDiv = viewChild.required('containerDiv', {
    read: ElementRef,
  });
  protected newKpPosition = signal<null | Point>(null);
  protected newKp = computed(() => this.getNewKp());
  protected allMarkers = computed(() => {
    const newKp = this.getNewKp();
    if (newKp) {
      return [newKp].concat(this.keypointModels());
    } else {
      return this.keypointModels();
    }
  });
  protected isSelectionAllowed = computed(() => {
    if (!this.labelerMode()) return false;
    if (this.newKp()) return false;
    return true;
  });

  protected mouseIsOverContainer = signal(false);
  protected mouseIsDownInContainer = signal(false);

  getTransform(keypoint: Keypoint) {
    return `translate3d(${keypoint.position().x}px, ${keypoint.position().y}px, 0px)`;
  }

  handleKeypointClick(event: Event, keypoint: Keypoint) {
    // Event stop prop doesn't work because mousedown event still propagates.
    // event.stopPropagation();
    if (this.isSelectionAllowed()) {
      this.selectedKeypoint.set(keypoint.id);
    } else if (keypoint.id === this.newKp()?.id) {
      this.keypointAdded.emit(this.newKp()!);
    }
  }

  // --- Mouse event handlers for the entire container ---

  handleMouseEnter(event: MouseEvent) {
    this.mouseIsOverContainer.set(true);
  }

  handleMouseLeave(event: MouseEvent) {
    this.mouseIsOverContainer.set(false);
    // Clear new keypoint position when mouse leaves
    this.newKpPosition.set(null);
  }

  handlePointerMove(event: PointerEvent) {
    // Filter out mousemove of child divs that bubble up.

    if (this.labelerMode()) {
      const containerElement = this.containerDiv().nativeElement;
      const containerRect = containerElement.getBoundingClientRect();

      // Calculate coordinates relative to the scaled container's top-left
      const clientXRelativeToContainer = event.clientX - containerRect.left;
      const clientYRelativeToContainer = event.clientY - containerRect.top;

      // Get the unscaled dimensions of the container.
      // offsetWidth/Height reflect the dimensions before any CSS transforms like scale.
      const unscaledWidth = containerElement.offsetWidth;
      const unscaledHeight = containerElement.offsetHeight;

      // Calculate the scale factors.
      // If unscaledWidth/Height is 0, set scale to 1 to avoid division by zero.
      const scaleX =
        unscaledWidth === 0 ? 1 : containerRect.width / unscaledWidth;
      const scaleY =
        unscaledHeight === 0 ? 1 : containerRect.height / unscaledHeight;

      // Divide the scaled coordinates by the scale factor to get the unscaled local coordinates.
      const unscaledX = clientXRelativeToContainer / scaleX;
      const unscaledY = clientYRelativeToContainer / scaleY;

      this.newKpPosition.set({ x: unscaledX, y: unscaledY });

      //this.newKpPosition.set({ x: event.offsetX, y: event.offsetY });
    }
  }

  handleMouseDown(event: MouseEvent) {
    this.mouseIsDownInContainer.set(true);
  }

  handleMouseUp(event: MouseEvent) {
    this.mouseIsDownInContainer.set(false);
  }

  protected getNewKp(): Keypoint | null {
    const newKpTemplate = this.newKpTemplate();
    const newKpPosition = this.newKpPosition();
    if (newKpTemplate && newKpPosition) {
      const newKp = {
        id: newKpTemplate.id!,
        colorClass: newKpTemplate.colorClass!,
        hoverText: newKpTemplate.hoverText!,
        position: computed(() => this.newKpPosition()!),
      };
      return newKp;
    } else {
      return null;
    }
  }
}
