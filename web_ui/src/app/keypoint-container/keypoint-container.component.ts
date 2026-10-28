import {
  afterEveryRender,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Keypoint, ViewerKeypoint } from '../keypoint';
import { SkeletonOverlayComponent } from '../components/skeleton-overlay/skeleton-overlay.component';
import {
  SkeletonEndpoint,
  SkeletonSegment,
  skeletonBones,
} from '../components/skeleton-overlay/skeleton-bones';
import { Point } from '@angular/cdk/drag-drop';
import { LabelerViewOptionsService } from '../labeler/labeler-view-options.service';
import { ViewerViewOptionsService } from '../viewer/viewer-view-options.service';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../components/dropdown/dropdown.component';
import {
  LabelCorner,
  LabelFrame,
  LABEL_OUTLINE_EM,
  labelOutlinePad,
  placeKeypointLabels,
} from './keypoint-label-placement';

@Component({
  selector: 'app-keypoint-container',
  templateUrl: './keypoint-container.component.html',
  styleUrl: './keypoint-container.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DropdownComponent, DropdownTriggerComponent, DropdownContentComponent, DropdownTriggerDirective, SkeletonOverlayComponent],
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

  /** Valid pairs only. Parents pass [] when the skeleton is invalid or absent. */
  skeletonPairs = input<[string, string][]>([]);
  showSkeleton = input(false);
  skeletonThickness = input(2);
  skeletonOpacity = input(1);

  protected displayedSegments = computed((): SkeletonSegment[] => {
    if (!this.showSkeleton()) return [];
    const movingId = this.selectedKeypointIsMoving()
      ? this.selectedKeypoint()
      : null;
    const crosshair = movingId ? this.crosshairPosition() : null;
    const endpoints: SkeletonEndpoint[] = this.keypointModels().map((kp) => {
      const position =
        kp.id === movingId && crosshair ? crosshair : kp.position();
      const viewer = kp as ViewerKeypoint;
      return {
        name: typeof viewer.name === 'string' ? viewer.name : kp.id,
        x: position.x,
        y: position.y,
        visible: kp.isVisible ? kp.isVisible() : true,
        modelKey: viewer.modelKey,
      };
    });
    return skeletonBones(this.skeletonPairs(), endpoints);
  });

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
    return this.keypointOpacity() / 2;
  });

  /** Fraction of the way from keypointOpacity to 1 for label opacity. 0 = same as keypoint, 1 = fully opaque. */
  private readonly keypointLabelOpacityFraction = 0.5;

  calculatedKeypointLabelOpacity(keypointId: string) {
    const kpOpacity = this.calculatedKeypointOpacity(keypointId);
    return kpOpacity + this.keypointLabelOpacityFraction * (1 - kpOpacity);
  }
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

  private labelCorners = new Map<string, LabelCorner>();
  private labelInk = signal(
    new Map<string, { w: number; h: number; insetLeft: number; insetTop: number }>(),
  );
  private frameSize = signal<LabelFrame>({ width: 0, height: 0 });
  private labelMeasureKey = '';

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.containerDiv().nativeElement as HTMLElement;
      const readFrame = () => {
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        const current = this.frameSize();
        if (current.width === width && current.height === height) return;
        this.frameSize.set({ width, height });
      };
      readFrame();
      const observer = new ResizeObserver(readFrame);
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    afterEveryRender(() => {
      if (!this.enableKeypointLabels()) return;
      const movingId = this.selectedKeypointIsMoving()
        ? this.selectedKeypoint()
        : null;
      const ids: string[] = [];
      for (const kp of this.keypointModels()) {
        if (!kp.position()) continue;
        const visible = !kp.isVisible || kp.isVisible();
        if (!visible || kp.id === movingId) continue;
        ids.push(kp.id);
      }
      ids.sort();
      const key = `${this.keypointLabelFontSize()}\0${ids.join('\0')}`;
      const measured = this.labelInk();
      if (key === this.labelMeasureKey && ids.every((id) => measured.has(id))) {
        return;
      }
      const root = this.containerDiv().nativeElement as HTMLElement;
      const next = new Map(measured);
      let complete = true;
      for (const text of root.querySelectorAll<SVGTextElement>(
        'text.keypoint-label',
      )) {
        const id = text.dataset['kpId'];
        if (!id || !ids.includes(id)) continue;
        const ink = inkBox(text, labelOutlinePad(this.keypointLabelFontSize()));
        if (!ink) {
          complete = false;
          continue;
        }
        next.set(id, ink);
      }
      if (ids.some((id) => !next.has(id))) complete = false;
      for (const id of [...next.keys()]) {
        if (!ids.includes(id)) next.delete(id);
      }
      let same = measured.size === next.size;
      if (same) {
        for (const [id, size] of next) {
          const old = measured.get(id);
          if (
            !old ||
            old.w !== size.w ||
            old.h !== size.h ||
            old.insetLeft !== size.insetLeft ||
            old.insetTop !== size.insetTop
          ) {
            same = false;
            break;
          }
        }
      }
      if (!same) this.labelInk.set(next);
      if (complete) this.labelMeasureKey = key;
    });
  }

  private labelOffsets = computed(() => {
    const markerSize = this.keypointSize();
    const measured = this.labelInk();
    const frame = this.frameSize();
    const movingId = this.selectedKeypointIsMoving()
      ? this.selectedKeypoint()
      : null;
    const liveIds = new Set<string>();
    const labels: { id: string; x: number; y: number; w: number; h: number }[] =
      [];
    let complete = frame.width > 0 && frame.height > 0;
    for (const kp of this.keypointModels()) {
      liveIds.add(kp.id);
      const position = kp.position();
      if (!position) continue;
      const visible = !kp.isVisible || kp.isVisible();
      if (!visible || kp.id === movingId) continue;
      const box = measured.get(kp.id);
      if (!box) {
        complete = false;
        continue;
      }
      labels.push({
        id: kp.id,
        x: position.x,
        y: position.y,
        w: box.w,
        h: box.h,
      });
    }
    for (const id of [...this.labelCorners.keys()]) {
      if (!liveIds.has(id)) this.labelCorners.delete(id);
    }
    if (!complete) return new Map();
    const placed = placeKeypointLabels(
      labels,
      markerSize,
      frame,
      this.labelCorners,
    );
    for (const [id, corner] of placed.corners) {
      this.labelCorners.set(id, corner);
    }
    return placed.offsets;
  });

  /**
   * SVG text x/y (baseline start) in image coordinates. Placement offsets are
   * from the marker's top-left corner. Empty until the frame and every ink box are known.
   */
  protected labelAnchors = computed(() => {
    const placed = this.labelOffsets();
    const measured = this.labelInk();
    const pad = labelOutlinePad(this.keypointLabelFontSize());
    const half = this.keypointSize() / 2;
    const positions = new Map<string, Point>();
    for (const kp of this.keypointModels()) {
      const p = kp.position();
      if (p) positions.set(kp.id, p);
    }
    const anchors = new Map<string, { x: number; y: number }>();
    for (const [id, offset] of placed) {
      const ink = measured.get(id);
      const p = positions.get(id);
      if (!ink || !p) continue;
      anchors.set(id, {
        x: p.x - half + offset.left + pad - ink.insetLeft,
        y: p.y - half + offset.top + pad - ink.insetTop,
      });
    }
    return anchors;
  });

  /** Centred stroke, so twice the width that shows outside the letters. */
  protected labelStrokeWidth = computed(
    () => 2 * LABEL_OUTLINE_EM * this.keypointLabelFontSize(),
  );

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

  /** Called when user clicks on a keypoint div */
  handleKeypointClick(event: Event, keypoint: Keypoint) {
    if (this.isSelectionAllowed()) {
      this.selectedKeypoint.set(keypoint.id);
    }
  }

  // --- Mouse event handlers for the entire container ---

  handleMouseOver() {
    this.mouseIsOverContainer.set(true);
  }

  handleMouseOut() {
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
    const client = this.mouseClientPosition();
    if (!client) return null;
    if (!this.mouseIsOverContainer()) return null;
    const local = this.toLocal(client);
    return {
      x: local.x - this.mouseDownOffset().x,
      y: local.y - this.mouseDownOffset().y,
    };
  });

  /** Client (screen) coordinates to image coordinates inside the zoomed container. */
  private toLocal(client: Point): Point {
    const containerElement = this.containerDiv().nativeElement as HTMLElement;
    const containerRect = containerElement.getBoundingClientRect();

    // offsetWidth/Height reflect the dimensions before any CSS transforms like scale.
    // Use DOM to calculate scale factor instead of using viewportCtx.scale()
    // because during rapid scrolling, updating this computed lags behind the signal scale.
    const unscaledWidth = containerElement.offsetWidth;
    const unscaledHeight = containerElement.offsetHeight;
    const scaleX =
      unscaledWidth === 0 ? 1 : containerRect.width / unscaledWidth;
    const scaleY =
      unscaledHeight === 0 ? 1 : containerRect.height / unscaledHeight;

    return {
      x: (client.x - containerRect.left) / scaleX,
      y: (client.y - containerRect.top) / scaleY,
    };
  }

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
      // Where on the marker the pointer went down, from the keypoint's true
      // position (the hit target box is pixel-snapped and can be off by a fraction).
      const local = this.toLocal({ x: event.clientX, y: event.clientY });
      const position = keypoint.position();
      this.mouseDownOffset.set({
        x: local.x - position.x,
        y: local.y - position.y,
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

/**
 * Text box of a label in image coordinates (getBBox ignores the zoom), padded
 * by the outline, and where it sits relative to the text's x/y.
 */
function inkBox(
  text: SVGTextElement,
  outlinePad: number,
): {
  w: number;
  h: number;
  insetLeft: number;
  insetTop: number;
} | null {
  let box: DOMRect;
  try {
    box = text.getBBox();
  } catch {
    return null;
  }
  if (box.width === 0 || box.height === 0) return null;
  const x = text.x.baseVal.length ? text.x.baseVal.getItem(0).value : 0;
  const y = text.y.baseVal.length ? text.y.baseVal.getItem(0).value : 0;
  return {
    w: box.width + outlinePad * 2,
    h: box.height + outlinePad * 2,
    insetLeft: box.x - x,
    insetTop: box.y - y,
  };
}
