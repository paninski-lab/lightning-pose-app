import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  Input,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Keypoint } from '../../keypoint';
import { Point } from '@angular/cdk/drag-drop';

/**
 * Keypoint display and interaction layer.
 *
 * For now display and interaction are combined into a single component which means
 * that when you scale the host div (zoom),it includes tooltips, crosshair. Instead
 * we might want to have some interaction elements like the crosshairs, tooltips,
 * and help text be outside of the zoomable(image and shown keypoints).
 *
 * Interaction details:
 * (viewer + labeler):
 *   - on keypoint hover, display tooltip of keypoint name
 *
 * (labeler):
 *   Supports "keypoint move mode" where a keypoint disappears and cursor
 *   turns into a crosshair until the user specifies the new position.
 *
 *   Interaction modes for moving keypoints: view and creation.
 *   1. View: dragging a keypoint moves it
 *   2. Creation: keypoint is in move mode until mousedown
 *
 *   Completing the above workflows emits `keypointUpdate` event.
 *
 *   // showCrosshair = selectedKeypointIsMoving = editMode || isDragging
 *
 *
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
  /** fixme: Right now this enables handlePointerMove handler only. */
  enableEditing = input<boolean>(false);

  keypointModels = input.required<Keypoint[]>();

  /** false renders keypoints as dots, true renders them as crosshairs */
  useCrossHairs = input(false);

  /** the selected keypoint */
  selectedKeypoint = model<string | null>(null);
  newKpTemplate = input<null | Partial<Keypoint>>(null);
  editMode = input(false);

  // Notifies parent of the user's intent to change keypoint position.
  keypointUpdated = output<{ kp: string; position: Point }>();

  private containerDiv = viewChild.required('containerDiv', {
    read: ElementRef,
  });

  private isSelectionAllowed = computed(() => {
    if (!this.enableEditing()) return false;
    if (this.editMode()) return false;
    return true;
  });

  protected mouseIsOverContainer = signal(false);
  private isMouseDownOnKeypoint = signal(false);

  getTransform(keypoint: Keypoint) {
    return `translate3d(${keypoint.position().x}px, ${keypoint.position().y}px, 0px)`;
  }

  /** Called when user clicks on a keypoint div */
  handleKeypointClick(event: Event, keypoint: Keypoint) {
    if (this.isSelectionAllowed()) {
      this.selectedKeypoint.set(keypoint.id);
    }
  }

  // --- Mouse event handlers for the entire container ---

  handleMouseOver(event: MouseEvent) {
    this.mouseIsOverContainer.set(true);
  }

  handleMouseOut(event: MouseEvent) {
    this.mouseIsOverContainer.set(false);
  }

  handlePointerMove(event: PointerEvent) {
    this.mouseClientPosition.set({ x: event.clientX, y: event.clientY });
    if (this.isMouseDownOnKeypoint()) {
      this.keypointIsDragging.set(true);
      event.stopPropagation();
    }
  }

  private mouseClientPosition = signal<Point | null>(null);

  protected crosshairPosition = computed((): Point | null => {
    if (!this.mouseClientPosition()) return null;
    if (!this.mouseIsOverContainer()) return null;

    const containerElement = this.containerDiv().nativeElement as HTMLElement;
    const containerRect = containerElement.getBoundingClientRect();

    // Calculate coordinates relative to the scaled container's top-left
    const clientXRelativeToContainer =
      this.mouseClientPosition()!.x - containerRect.left;
    const clientYRelativeToContainer =
      this.mouseClientPosition()!.y - containerRect.top;

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

    return { x: unscaledX, y: unscaledY };
  });

  protected showCrosshair = computed(() => {
    return this.selectedKeypointIsMoving();
  });

  protected selectedKeypointIsMoving = computed((): boolean => {
    return this.keypointIsDragging() || this.editMode();
  });

  private keypointIsDragging = signal(false);

  handleKeypointPointerDown(event: PointerEvent, keypoint: Keypoint | null) {
    if (
      keypoint &&
      !this.selectedKeypointIsMoving() /** in creatin mode, mouse down should not select keypoint */
    ) {
      this.selectedKeypoint.set(keypoint.id);
      this.isMouseDownOnKeypoint.set(true);
      event.stopPropagation();
    }

    // in creation mode, dont stop prop so that we pass this event through to the containerDiv handler.
    if (!keypoint && this.selectedKeypointIsMoving()) {
      event.stopPropagation();
    }

    // Capture the pointer to ensure pointerup is fired even if pointer leaves the element
    (this.containerDiv().nativeElement as HTMLElement).setPointerCapture(
      event.pointerId,
    );
  }

  handlePointerUp(event: PointerEvent) {
    const position = this.selectedKeypointIsMoving()
      ? this.crosshairPosition()
      : null;

    this.isMouseDownOnKeypoint.set(false);
    if (this.keypointIsDragging()) {
      this.keypointIsDragging.set(false);
      (this.containerDiv().nativeElement as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    }

    if (position) {
      this.keypointUpdated.emit({ kp: this.selectedKeypoint()!, position });
    }
  }
}
