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
export class SandboxComponent {
  kp: Keypoint[] = [
    {
      id: 'test',
      colorClass: signal('bg-base-300/30'),
      position: signal({ x: 10, y: 10 }),
      hoverText: 'test',
    },
  ];

  private i = 1;

  private newKpTemplate: Partial<Keypoint> = {
    id: 'newbie-' + this.i,
    colorClass: signal('bg-red-300/0'),
    hoverText: 'newbie',
  };
  protected newKp = null as null | Partial<Keypoint>;

  constructor() {
    this.newKp = this.newKpTemplate;
  }

  handleKeypointAdded(pos: Point) {
    this.kp.push({
      ...this.newKpTemplate,
      position: signal({ x: pos.x, y: pos.y }),
      colorClass: signal('bg-base-300/30'),
    } as Keypoint);
    this.i++;
    this.newKp = null;
    //this.newKp = { ...kp, id: 'newbie-' + this.i };
  }
}
