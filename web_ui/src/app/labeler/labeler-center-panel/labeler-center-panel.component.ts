import {
  ChangeDetectionStrategy,
  Component,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { MVFrame } from '../frame.model';
import { SaveActionData } from '../types';

@Component({
  selector: 'app-labeler-center-panel',
  imports: [],
  templateUrl: './labeler-center-panel.component.html',
  styleUrl: './labeler-center-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerCenterPanelComponent implements OnInit {
  frame = input<MVFrame | null>(null);

  save = output<SaveActionData>();
  protected selectedView = signal('unknown');
  protected selectedKeypoint = signal<string | null>(null);

  ngOnInit() {
    /** Default to the first view in the frame */
    const views = this.frame()?.views;
    if (views) {
      this.selectedView.set(views[0].viewName);
    }
  }
}
