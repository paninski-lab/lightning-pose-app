import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { ViewerSessionsPanelComponent } from '../../viewer/viewer-left-panel/viewer-sessions-panel.component';
import { Session } from '../../session.model';

@Component({
  selector: 'app-extract-frames-dialog',
  imports: [ViewerSessionsPanelComponent],
  templateUrl: './extract-frames-dialog.component.html',
  styleUrl: './extract-frames-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtractFramesDialogComponent {
  private dialogRef = inject(DialogRef);
  protected step = 'session';

  // Form data
  protected session = signal<Session | null>(null);
  protected nFrames = signal<number | null>(null);

  protected handleCloseClick() {
    this.dialogRef.close();
  }

  protected handleStepClick(event: Event, step: string) {
    event.preventDefault();
    this.step = step;
  }

  handleSelectedSessionChange(session: Session | null) {
    this.session.set(session);
  }

  /** Returns true if the form is valid: session is selected, options are valid. */
  protected isValid() {
    if (this.session() === null) {
      return false;
    }
    if (this.nFrames() === null || this.nFrames()! < 1) {
      return false;
    }
    return true;
  }

  /** Makes a request object that the extract frames service can execute. */
  private toExtractFramesRequest() {
    // Assume validity. Calls will be guarded by is valid.
  }
}
