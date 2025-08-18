import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { KeypointContainerComponent } from '../components/keypoint-container/keypoint-container.component';
import { Keypoint } from '../keypoint';
import { Point } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-sandbox',
  imports: [KeypointContainerComponent],
  templateUrl: './sandbox.component.html',
  styleUrl: './sandbox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SandboxComponent {}
