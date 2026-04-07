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
import { Keypoint } from '../keypoint';
import { Point } from '@angular/cdk/drag-drop';
import { LabelerViewOptionsService } from '../labeler/labeler-view-options.service';
import { ViewerViewOptionsService } from '../viewer/viewer-view-options.service';
import { NgClass } from '@angular/common';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../components/dropdown/dropdown.component';

@Component({
  selector: 'app-keypoint-container',
  templateUrl: './keypoint-container.component.html',
  styleUrl: './keypoint-container.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, DropdownComponent, DropdownTriggerComponent, DropdownContentComponent, DropdownTriggerDirective],
})
export class KeypointContainerComponent {
  enableEditing = input<boolean>(false);
  keypointModels = input.required<Keypoint[]>();

  /** false renders keypoints as dots, true renders them as crosshairs on top of them */
  useCrossHairs = input(false);
  /** Enables on-keypoint-hover tooltips */
  enableKeypointHoverTooltips = input(false);

  /** the selected keypoint */
  selectedKeypoint = model<string | null>(null);
  newKpTemplate = input<null | Partial<Keypoint>>(null);
  editMode = input(false);

  // one of them must be provided
  labelerViewOptions = input<LabelerViewOptionsService>();
  viewerViewOptions = input<ViewerViewOptionsService>();

  keypointSize = computed(() => {
    try {
      return (this.labelerViewOptions()?.keypointSize() ??
        this.viewerViewOptions()?.keypointSize())!;
    } catch (e) {
      // catch when label or view not set then keypoint size is undefined
      alert('labelerViewOptions and viewerViewOptions both unset');
      throw e;
    }
  });

  /** for hiding other keypoints while editing */
  calculatedKeypointOpacity(keypointId: string) {
    if (this.selectedKeypointIsMoving() && this.crosshairPosition()) {
      return this.selectedKeypoint() !== keypointId
        ? this.reducedKeypointOpacity()
        : this.keypointOpacity();
    }
    return this.keypointOpacity();
  }
  reducedKeypointOpacity = computed(() => {
    return 0;
  });
  keypointOpacity = computed(() => {
    if (this.labelerViewOptions()) {
      return this.labelerViewOptions()!.keypointOpacity();
    } else if (this.viewerViewOptions()) {
      return this.viewerViewOptions()!.keypointOpacity();
    } else {
      throw new Error('labelerViewOptions and viewerViewOptions both unset');
    }
  });

  enableKeypointLabels = computed(() => {
    return (
      this.labelerViewOptions()?.enableKeypointLabels() ??
      this.viewerViewOptions()?.enableKeypointLabels() ??
      true
    );
  });

  keypointLabelFontSize = computed(() => {
    return (
      this.labelerViewOptions()?.keypointLabelFontSize() ??
      this.viewerViewOptions()?.keypointLabelFontSize() ??
      8
    );
  });

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
    const cssPosition = keypoint.position();
    const x = cssPosition.x;
    const y = cssPosition.y;
    const isVisible = !keypoint.isVisible || keypoint.isVisible();
    const scale = isVisible ? 1 : 0;
    return `translate3d(calc(${x}px - 50%), calc(${y}px - 50%), 0px) scale(${scale})`;
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
  // Pixels away from the center of the keypoint, at time of pointerdown on keypoint.
  private mouseDownOffset = signal<Point>({ x: 0, y: 0 });

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
    // Note: Use DOM to calculate scale factor instead of using viewportCtx.scale()
    // because during rapid scrolling, updating this computed lags behind the signal scale.
    const scaleX =
      unscaledWidth === 0 ? 1 : containerRect.width / unscaledWidth;
    const scaleY =
      unscaledHeight === 0 ? 1 : containerRect.height / unscaledHeight;

    // Divide the scaled coordinates by the scale factor to get the unscaled local coordinates.
    const unscaledX = clientXRelativeToContainer / scaleX;
    const unscaledY = clientYRelativeToContainer / scaleY;

    return {
      x: unscaledX - this.mouseDownOffset()!.x,
      y: unscaledY - this.mouseDownOffset()!.y,
    };
  });

  protected showCrosshair = computed(() => {
    return this.selectedKeypointIsMoving();
  });

  protected selectedKeypointIsMoving = computed((): boolean => {
    return this.keypointIsDragging() || this.editMode();
  });

  private keypointIsDragging = signal(false);
  protected selectedKeypointBorderWidth = 0.5;

  handleKeypointPointerDown(event: PointerEvent, keypoint: Keypoint | null) {
    if (
      this.enableEditing() &&
      keypoint &&
      !this.selectedKeypointIsMoving() /** in creation mode, mouse down should not select keypoint */
    ) {
      this.selectedKeypoint.set(keypoint.id);
      this.isMouseDownOnKeypoint.set(true);
      this.mouseDownOffset.set({
        x:
          event.offsetX -
          this.keypointSize() / 2 +
          this.selectedKeypointBorderWidth,
        y:
          event.offsetY -
          this.keypointSize() / 2 +
          this.selectedKeypointBorderWidth,
      });
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
    this.mouseDownOffset.set({ x: 0, y: 0 });
    if (this.keypointIsDragging()) {
      this.keypointIsDragging.set(false);
      (this.containerDiv().nativeElement as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    }

    if (position) {
      this.keypointUpdated.emit({
        kp: this.selectedKeypoint()!,
        position,
      });
    }
  }
}
