import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  contentChild,
  ElementRef,
  HostListener,
  inject,
  Input,
  input,
  OnDestroy,
  Renderer2,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-zoomable-content',
  imports: [],
  template: `
    <div
      #viewport
      class="relative w-full h-full overflow-hidden"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
    >
      <div
        class="absolute transform-gpu transition-transform duration-0 origin-top-left"
        [style.transform]="getTransform()"
      >
        <ng-content></ng-content>
      </div>
    </div>
    <!--
    <div class="flex justify-between">
      @if (scale > calculateMinScale()) {
        <span>Zoom: {{ scale / calculateMinScale() | number: '1.0-2' }}</span>
        <span>(Click and drag to pan)</span>
      }
    </div>
    -->
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoomableContentComponent
  implements AfterViewInit, OnDestroy, AfterContentInit
{
  private cdr = inject(ChangeDetectorRef);
  @Input() maxScale = 6; // Maximum zoom level
  @Input() zoomSpeed = 0.0015; // How fast to zoom per scroll tick

  @ViewChild('viewport') viewportRef!: ElementRef<HTMLDivElement>;

  /** Labeling the content with #content is required to reliably fetch it.
   * We use that to compute the contentSize which is used in translation calculation. */
  projectedContentRef = contentChild.required('content', { read: ElementRef });

  // Internal state for content dimensions
  contentWidth = 0;
  contentHeight = 0;

  scale = 1;
  translateX = 0;
  translateY = 0;

  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private resizeUnlisten?: () => void;
  private contentResizeObserver?: ResizeObserver; // Declare ResizeObserver
  interactivityDisabled = input(false);

  constructor(private renderer: Renderer2) {}

  ngAfterViewInit(): void {
    this.updateViewportDimensions();
    this.resizeUnlisten = this.renderer.listen('window', 'resize', () =>
      this.updateViewportDimensions(),
    );
  }

  ngAfterContentInit(): void {
    if (this.projectedContentRef()) {
      const contentElement = this.projectedContentRef()
        .nativeElement as HTMLElement;

      // Initialize content dimensions directly from the projected element
      // This will get the current rendered size of the content.
      this.setContentDimensions(
        contentElement.offsetWidth,
        contentElement.offsetHeight,
      );

      // Set up ResizeObserver to react to changes in content size
      this.contentResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === contentElement) {
            // Update dimensions when the content's size changes
            this.setContentDimensions(
              entry.contentRect.width,
              entry.contentRect.height,
            );
          }
        }
      });
      // Start observing the projected content element
      this.contentResizeObserver.observe(contentElement);
    }
  }

  ngOnDestroy(): void {
    if (this.resizeUnlisten) {
      this.resizeUnlisten();
    }
    // Disconnect ResizeObserver to prevent memory leaks
    if (this.contentResizeObserver) {
      this.contentResizeObserver.disconnect();
    }
  }

  getTransform(): string {
    return `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  }

  /**
   * Updates the stored dimensions of the viewport.
   */
  private updateViewportDimensions(): void {
    this.viewportWidth = this.viewportRef.nativeElement.offsetWidth;
    this.viewportHeight = this.viewportRef.nativeElement.offsetHeight;
    // Re-fit content if viewport size changes after initial load
    if (this.contentWidth > 0 && this.contentHeight > 0) {
      this.fitContentToViewport();
    }
  }

  /**
   * Sets the content dimensions and fits it to the viewport
   */
  setContentDimensions(width: number, height: number): void {
    // Only update if dimensions have actually changed to avoid unnecessary recalculations
    if (this.contentWidth !== width || this.contentHeight !== height) {
      this.contentWidth = width;
      this.contentHeight = height;
      this.fitContentToViewport();
    }
  }

  protected calculateMinScale(): number {
    if (
      !this.contentWidth ||
      !this.contentHeight ||
      !this.viewportWidth ||
      !this.viewportHeight
    ) {
      return 1;
    }
    // Calculate the scale needed to fit the viewport width and height respectively
    const scaleX = this.viewportWidth / this.contentWidth;
    const scaleY = this.viewportHeight / this.contentHeight;

    // The minimum scale is the smaller of the two, ensuring the entire content fits within the viewport
    return Math.min(scaleX, scaleY);
  }

  /**
   * Calculates the initial scale and position to fit the content within the viewport.
   */
  private fitContentToViewport(): void {
    if (
      this.contentWidth === 0 ||
      this.contentHeight === 0 ||
      this.viewportWidth === 0 ||
      this.viewportHeight === 0
    ) {
      return;
    }

    this.scale = this.calculateMinScale();

    // Center the content horizontally. Align to top vertically.
    this.translateX = (this.viewportWidth - this.contentWidth * this.scale) / 2;
    this.translateY = 0;

    // Ensure scale is not over max bound
    this.scale = Math.min(this.maxScale, this.scale);
    this.cdr.markForCheck();
  }

  /**
   * Handles pointer down event for initiating dragging.
   */
  onPointerDown(event: PointerEvent): void {
    if (this.interactivityDisabled()) {
      return;
    }
    // Prevent default browser drag behavior (unless target is draggable)
    if (
      event.target instanceof Element &&
      !event.target.getAttribute('draggable')
    ) {
      event.preventDefault();
    }
    this.isDragging = true;
    this.startX = event.clientX - this.translateX;
    this.startY = event.clientY - this.translateY;
    this.renderer.addClass(this.viewportRef.nativeElement, 'cursor-grabbing');
    // Capture the pointer to ensure pointermove and pointerup events
    // continue to fire on this element even if the pointer leaves its bounds.
    this.viewportRef.nativeElement.setPointerCapture(event.pointerId);
  }

  /**
   * Handles pointer up or pointer cancel event for ending dragging.
   */
  onPointerUp(event: PointerEvent): void {
    if (this.interactivityDisabled()) {
      return;
    }
    if (this.isDragging) {
      this.isDragging = false;
      this.renderer.removeClass(
        this.viewportRef.nativeElement,
        'cursor-grabbing',
      );
      // Release the pointer capture if it was active for this pointer
      if (this.viewportRef.nativeElement.hasPointerCapture(event.pointerId)) {
        this.viewportRef.nativeElement.releasePointerCapture(event.pointerId);
      }
    }
  }

  /**
   * Handles pointer move event for panning.
   * This is now triggered by (pointermove) on the viewport,
   * with events continuing to fire due to setPointerCapture.
   */
  onPointerMove(event: PointerEvent): void {
    if (this.interactivityDisabled()) {
      return;
    }
    if (!this.isDragging) {
      return;
    }

    // Calculate new translation based on pointer movement
    this.translateX = event.clientX - this.startX;
    this.translateY = event.clientY - this.startY;

    // Add boundary checks for panning
    this.applyPanningBounds();
  }

  /**
   * Handles the 'lostpointercapture' event, ensuring drag state is reset if capture is lost for any reason.
   */
  @HostListener('window:lostpointercapture', ['$event'])
  onLostPointerCapture(event: PointerEvent): void {
    // This event fires on the element that lost capture.
    // Ensure it's our viewport element that lost it and dragging was active.
    if (event.target === this.viewportRef.nativeElement && this.isDragging) {
      this.isDragging = false;
      this.renderer.removeClass(
        this.viewportRef.nativeElement,
        'cursor-grabbing',
      );
    }
  }

  /**
   * Handles mouse wheel event for zooming.
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (this.interactivityDisabled()) {
      return;
    }
    event.preventDefault(); // Prevent page scrolling

    const viewportRect = this.viewportRef.nativeElement.getBoundingClientRect();
    // Mouse position relative to the viewport
    const mouseX = event.clientX - viewportRect.left;
    const mouseY = event.clientY - viewportRect.top;

    // Calculate new scale based on scroll direction
    const delta = event.deltaY * -this.zoomSpeed; // Invert deltaY for natural zoom direction
    const newScale = this.scale * (1 + delta);

    // Clamp newScale to dynamic min and fixed max bounds
    const minScale = this.calculateMinScale();
    const clampedNewScale = Math.max(
      minScale,
      Math.min(this.maxScale, newScale),
    );

    // Only proceed if scale actually changed
    if (clampedNewScale === this.scale) {
      return;
    }

    // Find the point on the content (in its original, unscaled dimensions) that is under the mouse
    const contentPointX = (mouseX - this.translateX) / this.scale;
    const contentPointY = (mouseY - this.translateY) / this.scale;

    // Apply the new scale
    this.scale = clampedNewScale;

    // Calculate the new translation needed to bring that same content point back under the mouse
    this.translateX = mouseX - contentPointX * this.scale;
    this.translateY = mouseY - contentPointY * this.scale;

    // Add boundary checks for panning after zoom
    this.applyPanningBounds();
  }

  /**
   * Applies boundary checks to prevent panning the content too far outside the viewport.
   */
  private applyPanningBounds(): void {
    const scaledContentWidth = this.contentWidth * this.scale;
    const scaledContentHeight = this.contentHeight * this.scale;

    // Calculate min and max translation values for X axis
    const minBoundX = this.viewportWidth - scaledContentWidth;
    const maxBoundX = 0;

    // Calculate min and max translation values for Y axis
    const minBoundY = this.viewportHeight - scaledContentHeight;
    const maxBoundY = 0;

    // Clamp translateX
    if (scaledContentWidth <= this.viewportWidth) {
      // If content is smaller than or equal to viewport width, center it
      this.translateX = (this.viewportWidth - scaledContentWidth) / 2;
    } else {
      // Otherwise, clamp to edges
      this.translateX = Math.max(
        minBoundX,
        Math.min(maxBoundX, this.translateX),
      );
    }

    // Clamp translateY
    if (scaledContentHeight <= this.viewportHeight) {
      // If content is smaller than or equal to viewport height, align to top.
      this.translateY = 0;
    } else {
      // Otherwise, clamp to edges
      this.translateY = Math.max(
        minBoundY,
        Math.min(maxBoundY, this.translateY),
      );
    }
  }
}
