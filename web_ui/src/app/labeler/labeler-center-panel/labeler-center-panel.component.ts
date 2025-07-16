import {
  ChangeDetectionStrategy,
  Component,
  input,
  OnChanges,
  output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { Frame } from '../frame.model';
import { SaveActionData, LKeypoint } from '../types';
import { MultiView } from '../../multiview.model';

@Component({
  selector: 'app-labeler-center-panel',
  imports: [],
  templateUrl: './labeler-center-panel.component.html',
  styleUrl: './labeler-center-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerCenterPanelComponent implements OnChanges {
  frame = input<Frame | null>(null);
  keypoints = input<MultiView<LKeypoint[]> | null>();

  save = output<SaveActionData>();
  protected selectedView = signal('unknown');
  protected selectedKeypoint = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['frame'] || changes['keypoints']) {
      this.loadFrame();
    }
  }

  private loadFrame(): void {
    /** Component initialization */
    this.selectedView.set(
      (this.frame()?.views ?? [])[0]?.viewName ?? 'unknown',
    );
    this.selectedKeypoint.set(
      this.keypoints()?.views[this.selectedView()][0]?.keypointName ?? null,
    );
  }
}
