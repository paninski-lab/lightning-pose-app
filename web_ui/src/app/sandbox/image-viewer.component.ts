import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  HostListener,
  AfterViewInit,
  OnDestroy,
  Renderer2,
  input,
} from '@angular/core';

// Define the interface for a keypoint
interface Keypoint {
  x: number; // X coordinate relative to the original image (0-1, or pixels)
  y: number; // Y coordinate relative to the original image (0-1, or pixels)
  label?: string; // Optional label for the keypoint
  color?: string; // Optional color for the keypoint
}

@Component({
  selector: 'app-image-viewer',
  template: `
    <div
      #viewport
      class="relative w-full h-full overflow-hidden rounded-lg bg-gray-100 shadow-lg"
      (mousedown)="onMouseDown($event)"
      (mouseup)="onMouseUp()"
      (mouseleave)="onMouseUp()"
    >
      <div
        class="absolute transform-gpu transition-transform duration-0 ease-linear origin-top-left"
        [style.transform]="getTransform()"
      >
        <img
          #imageElement
          [src]="imageUrl"
          (load)="onImageLoad()"
          class="block w-full h-auto rounded-md"
          alt="Zoomable Image"
        />
        @for (kp of keypoints(); track $index) {
          <div
            class="keypoint-marker absolute rounded-full border-2 border-white cursor-pointer flex items-center justify-center text-xs text-white font-bold"
            [style.left.px]="kp.x"
            [style.top.px]="kp.y"
            [style.backgroundColor]="kp.color || 'red'"
            [style.opacity]="0.5"
            [title]="kp.label || 'Keypoint ' + ($index + 1)"
          >
            @if (kp.label) {
              <span class="p-1 whitespace-nowrap">{{ kp.label }}</span>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        font-family: 'Inter', sans-serif;
      }

      .keypoint-marker {
        width: 20px;
        height: 20px;
        margin-left: -10px; /* Center the marker horizontally */
        margin-top: -10px; /* Center the marker vertically */
        box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
      }
    `,
  ],
})
export class ImageViewerComponent implements AfterViewInit, OnDestroy {
  @Input() imageUrl: string = '';
  keypoints = input<Keypoint[]>([]);
  @Input() maxScale: number = 6; // Maximum zoom level
  @Input() zoomSpeed: number = 0.0015; // How fast to zoom per scroll tick

  @ViewChild('viewport') viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('imageElement') imageElementRef!: ElementRef<HTMLImageElement>;

  scale: number = 1;
  translateX: number = 0;
  translateY: number = 0;

  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;
  private imageNaturalWidth: number = 0;
  private imageNaturalHeight: number = 0;
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;
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
   * Called when the image finishes loading.
   * Sets the initial image dimensions and centers the image if possible.
   */
  onImageLoad(): void {
    const img = this.imageElementRef.nativeElement;
    this.imageNaturalWidth = img.naturalWidth;
    this.imageNaturalHeight = img.naturalHeight;

    // Fit image to viewport initially
    this.fitImageToViewport();
  }

  /**
   * Updates the stored dimensions of the viewport.
   */
  private updateViewportDimensions(): void {
    this.viewportWidth = this.viewportRef.nativeElement.offsetWidth;
    this.viewportHeight = this.viewportRef.nativeElement.offsetHeight;
    // Re-fit image if viewport size changes after initial load
    if (this.imageNaturalWidth > 0 && this.imageNaturalHeight > 0) {
      this.fitImageToViewport();
    }
  }

  private calculateMinScale(): number {
    if (
      !this.imageNaturalWidth ||
      !this.imageNaturalHeight ||
      !this.viewportWidth ||
      !this.viewportHeight
    ) {
      return 1;
    }
    // Calculate the scale needed to fit the viewport width and height respectively
    const scaleX = this.viewportWidth / this.imageNaturalWidth;
    const scaleY = this.viewportHeight / this.imageNaturalHeight;

    // The minimum scale is the smaller of the two, ensuring the entire image fits within the viewport
    // (this may leave empty space on one dimension, but ensures no cropping)
    return Math.min(scaleX, scaleY);
  }

  /**
   * Calculates the initial scale and position to fit the image within the viewport.
   */
  private fitImageToViewport(): void {
    if (
      this.imageNaturalWidth === 0 ||
      this.imageNaturalHeight === 0 ||
      this.viewportWidth === 0 ||
      this.viewportHeight === 0
    ) {
      return;
    }

    this.scale = this.calculateMinScale();

    // Center the image
    this.translateX =
      (this.viewportWidth - this.imageNaturalWidth * this.scale) / 2;
    this.translateY =
      (this.viewportHeight - this.imageNaturalHeight * this.scale) / 2;

    // Ensure scale is not over max bound
    this.scale = Math.min(this.maxScale, this.scale);
  }

  /**
   * Handles mouse down event for initiating dragging.
   * @param event MouseEvent
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
   * @param event MouseEvent
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
   * @param event WheelEvent
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

    // Find the point on the image (in its original, unscaled dimensions) that is under the mouse
    const imagePointX = (mouseX - this.translateX) / this.scale;
    const imagePointY = (mouseY - this.translateY) / this.scale;

    // Apply the new scale
    this.scale = clampedNewScale;

    // Calculate the new translation needed to bring that same image point back under the mouse
    this.translateX = mouseX - imagePointX * this.scale;
    this.translateY = mouseY - imagePointY * this.scale;

    // Add boundary checks for panning after zoom
    this.applyPanningBounds();
  }

  /**
   * Applies boundary checks to prevent panning the image too far outside the viewport.
   */
  private applyPanningBounds(): void {
    const scaledImageWidth = this.imageNaturalWidth * this.scale;
    const scaledImageHeight = this.imageNaturalHeight * this.scale;

    // Calculate min and max translation values for X axis
    const minBoundX = this.viewportWidth - scaledImageWidth;
    const maxBoundX = 0;

    // Calculate min and max translation values for Y axis
    const minBoundY = this.viewportHeight - scaledImageHeight;
    const maxBoundY = 0;

    // Clamp translateX
    if (scaledImageWidth <= this.viewportWidth) {
      // If image is smaller than or equal to viewport width, center it
      this.translateX = (this.viewportWidth - scaledImageWidth) / 2;
    } else {
      // Otherwise, clamp to edges
      this.translateX = Math.max(
        minBoundX,
        Math.min(maxBoundX, this.translateX),
      );
    }

    // Clamp translateY
    if (scaledImageHeight <= this.viewportHeight) {
      // If image is smaller than or equal to viewport height, center it
      this.translateY = (this.viewportHeight - scaledImageHeight) / 2;
    } else {
      // Otherwise, clamp to edges
      this.translateY = Math.max(
        minBoundY,
        Math.min(maxBoundY, this.translateY),
      );
    }
  }
}
