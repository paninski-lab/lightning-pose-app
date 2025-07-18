import {
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  Renderer2,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-zoomable-content',
  imports: [DecimalPipe],
  template: `
    <div
      #viewport
      class="relative w-full h-full overflow-hidden"
      (mousedown)="onMouseDown($event)"
      (mouseup)="onMouseUp()"
      (mouseleave)="onMouseUp()"
    >
      <div
        class="absolute transform-gpu transition-transform duration-0 origin-top-left"
        [style.transform]="getTransform()"
      >
        <ng-content></ng-content>
      </div>
    </div>

    <div class="flex justify-between">
      @if (scale > calculateMinScale()) {
        <span>Zoom: {{ scale / calculateMinScale() | number: '1.0-2' }}</span>
        <span>(Click and drag to pan)</span>
      }
    </div>
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
})
export class ZoomableContentComponent implements AfterViewInit, OnDestroy {
  @Input() maxScale = 6; // Maximum zoom level
  @Input() zoomSpeed = 0.0015; // How fast to zoom per scroll tick
  @Input() contentWidth = 0; // Natural width of the content
  @Input() contentHeight = 0; // Natural height of the content

  @ViewChild('viewport') viewportRef!: ElementRef<HTMLDivElement>;

  scale = 1;
  translateX = 0;
  translateY = 0;

  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private resizeUnlisten?: () => void;

  constructor(private renderer: Renderer2) {}

  ngAfterViewInit(): void {
    this.updateViewportDimensions();
    // Store the unlisten function for cleanup
    this.resizeUnlisten = this.renderer.listen('window', 'resize', () =>
      this.updateViewportDimensions(),
    );
  }

  ngOnDestroy(): void {
    // Clean up the resize listener
    if (this.resizeUnlisten) {
      this.resizeUnlisten();
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
    this.contentWidth = width;
    this.contentHeight = height;
    this.fitContentToViewport();
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

    // Center the content
    this.translateX = (this.viewportWidth - this.contentWidth * this.scale) / 2;
    this.translateY =
      (this.viewportHeight - this.contentHeight * this.scale) / 2;

    // Ensure scale is not over max bound
    this.scale = Math.min(this.maxScale, this.scale);
  }

  /**
   * Handles mouse down event for initiating dragging.
   */
  onMouseDown(event: MouseEvent): void {
    event.preventDefault(); // Prevent default browser drag behavior
    this.isDragging = true;
    this.startX = event.clientX - this.translateX;
    this.startY = event.clientY - this.translateY;
    this.renderer.addClass(this.viewportRef.nativeElement, 'cursor-grabbing');
  }

  /**
   * Handles mouse up event for ending dragging.
   */
  onMouseUp(): void {
    this.isDragging = false;
    this.renderer.removeClass(
      this.viewportRef.nativeElement,
      'cursor-grabbing',
    );
  }

  /**
   * Handles mouse move event for panning.
   */
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) {
      return;
    }
    event.preventDefault();

    // Calculate new translation based on mouse movement
    this.translateX = event.clientX - this.startX;
    this.translateY = event.clientY - this.startY;

    // Add boundary checks for panning
    this.applyPanningBounds();
  }

  /**
   * Handles mouse wheel event for zooming.
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
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
      // If content is smaller than or equal to viewport height, center it
      this.translateY = (this.viewportHeight - scaledContentHeight) / 2;
    } else {
      // Otherwise, clamp to edges
      this.translateY = Math.max(
        minBoundY,
        Math.min(maxBoundY, this.translateY),
      );
    }
  }
}
