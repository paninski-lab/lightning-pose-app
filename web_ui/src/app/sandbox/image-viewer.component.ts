import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  input,
} from '@angular/core';
import { ZoomableContentComponent } from './zoomable-content.component';

// Define the interface for a keypoint
interface Keypoint {
  x: number;
  y: number;
  label?: string;
  color?: string;
}

@Component({
  selector: 'app-image-viewer',
  template: `
    <app-zoomable-content
      #zoomableContent
      [maxScale]="maxScale"
      [zoomSpeed]="zoomSpeed"
    >
      <div class="relative">
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
    </app-zoomable-content>
  `,
  styleUrls: ['./image-viewer.component.css'],
  imports: [ZoomableContentComponent],
})
export class ImageViewerComponent implements AfterViewInit {
  @Input() imageUrl = '';
  keypoints = input<Keypoint[]>([]);
  @Input() maxScale = 6;
  @Input() zoomSpeed = 0.0015;

  @ViewChild('imageElement') imageElementRef!: ElementRef<HTMLImageElement>;
  @ViewChild('zoomableContent') zoomableContent!: ZoomableContentComponent;

  ngAfterViewInit(): void {
    // Any initialization if needed
  }

  /**
   * Called when the image finishes loading.
   * Sets the image dimensions in the zoomable content component.
   */
  onImageLoad(): void {
    const img = this.imageElementRef.nativeElement;
    this.zoomableContent.setContentDimensions(
      img.naturalWidth,
      img.naturalHeight,
    );
  }
}
