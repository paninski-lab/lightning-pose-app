import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ViewerSessionsPanelComponent } from '../../viewer/viewer-left-panel/viewer-sessions-panel.component';
import { Session } from '../../session.model';
import { FormsModule } from '@angular/forms';
import { MVLabelFile } from '../../label-file.model';

@Component({
  selector: 'app-extract-frames-dialog',
  imports: [ViewerSessionsPanelComponent, FormsModule],
  templateUrl: './extract-frames-dialog.component.html',
  styleUrl: './extract-frames-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtractFramesDialogComponent {
  private dialogRef = inject(DialogRef);
  private dialogData: { labelFile: MVLabelFile } = inject(DIALOG_DATA);

  protected step = signal('session');

  // Form data
  protected session = signal<Session | null>(null);
  protected nFrames = signal<number | null>(null);
  protected isProcessing = signal(false);

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
    return {
      session: {
        views: this.session()!.views,
      },
      labelFile: {
        views: this.dialogData.labelFile.views,
      },
    };
  }

  handleExtractFramesClick() {
    this.isProcessing.set(true);
  }
}
