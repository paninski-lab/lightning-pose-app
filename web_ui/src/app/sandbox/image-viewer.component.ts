import {
  Component,
  Input,
  input,
  // Removed: ElementRef, ViewChild, HostListener, AfterViewInit, OnDestroy, Renderer2
} from '@angular/core';

// Import ZoomableContentComponent
import { ZoomableContentComponent } from './zoomable-content.component'; // Adjust path if necessary

// Define the interface for a keypoint
interface Keypoint {
  x: number; // X coordinate relative to the original image (0-1, or pixels)
  y: number; // Y coordinate relative to the original image (0-1, or pixels)
  label?: string; // Optional label for the keypoint
  color?: string; // Optional color for the keypoint
}

@Component({
  selector: 'app-image-viewer',
  standalone: true, // Assuming this component is standalone
  imports: [ZoomableContentComponent], // Import ZoomableContentComponent here
  template: `
    <app-zoomable-content
      [maxScale]="maxScale"
      [zoomSpeed]="zoomSpeed"
      class="relative w-full h-full rounded-lg bg-gray-100 shadow-lg"
    >
      <img
        #content
        [src]="imageUrl"
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
    </app-zoomable-content>
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
export class ImageViewerComponent {
  // Removed AfterViewInit, OnDestroy
  @Input() imageUrl: string = '';
  keypoints = input<Keypoint[]>([]);
  @Input() maxScale: number = 6; // Maximum zoom level
  @Input() zoomSpeed: number = 0.0015; // How fast to zoom per scroll tick

  // All previous properties and methods related to zooming/panning/dragging
  // have been removed as ZoomableContentComponent now handles them.
}
