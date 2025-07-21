import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ImageViewerComponent } from './image-viewer.component';

@Component({
  selector: 'app-sandbox',
  imports: [ImageViewerComponent],
  templateUrl: './sandbox.component.html',
  styleUrl: './sandbox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SandboxComponent {
  imageUrl =
    '/app/v0/files//home/ksikka/work/LightningPoseData/chickadee-crop/labeled-data/CHC41_200705_105803_lBack/img00000005.png';
  keypoints = [
    {
      x: 300,
      y: 250,
      label: 'hello',
      color: 'green',
    },
  ];
}
