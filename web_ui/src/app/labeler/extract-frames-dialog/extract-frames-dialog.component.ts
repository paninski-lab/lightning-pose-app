import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { ViewerSessionsPanelComponent } from '../../viewer/viewer-left-panel/viewer-sessions-panel.component';
import { Session } from '../../session.model';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-extract-frames-dialog',
  imports: [ViewerSessionsPanelComponent, FormsModule],
  templateUrl: './extract-frames-dialog.component.html',
  styleUrl: './extract-frames-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtractFramesDialogComponent {
  private dialogRef = inject(DialogRef);
  protected step = signal('session');

  // Form data
  protected session = signal<Session | null>(null);
  protected nFrames = signal<number | null>(null);

  protected handleCloseClick() {
    this.dialogRef.close();
  }

  handleSelectedSessionChange(session: Session | null) {
    this.session.set(session);
  }

  protected sessionStepIsValid = computed(() => {
    return this.session() !== null;
  });

  protected settingsStepIsValid = computed(() => {
    if (this.nFrames() === null || this.nFrames()! < 1) {
      return false;
    }
    return true;
  });

  /** Makes a request object that the extract frames service can execute. */
  private toExtractFramesRequest() {
    // Assume validity. Calls will be guarded by is valid.
  }

  handleExtractFramesClick() {
    //todo
  }
}
