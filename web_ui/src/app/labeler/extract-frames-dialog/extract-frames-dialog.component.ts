import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { ViewerSessionsPanelComponent } from '../../viewer/viewer-left-panel/viewer-sessions-panel.component';
import { Session } from '../../session.model';
import { FormsModule } from '@angular/forms';
import { RpcService } from '../../rpc.service';
import { ExtractFramesRequest } from '../../extract-frames-request';
import { LabelFilePickerComponent } from '../../label-file-picker/label-file-picker.component';

@Component({
  selector: 'app-extract-frames-dialog',
  imports: [
    ViewerSessionsPanelComponent,
    FormsModule,
    LabelFilePickerComponent,
  ],
  templateUrl: './extract-frames-dialog.component.html',
  styleUrl: './extract-frames-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtractFramesDialogComponent implements OnInit {
  protected step = signal('labelFile');
  protected stepOrder = ['labelFile', 'session', 'settings'];

  initialLabelFileSelectionType = input<'createNew' | 'useExisting'>(
    'createNew',
  );
  initialSelectedLabelFileKey = input<string | null>(null);

  ngOnInit() {
    this.labelFileSelectionType.set(this.initialLabelFileSelectionType());
    this.existingLabelFileKey.set(this.initialSelectedLabelFileKey());
  }

  // Form data
  protected labelFileSelectionType = signal<'createNew' | 'useExisting'>(
    'createNew',
  );
  // Only applicable when labelFileSelectionType == useExisting
  protected existingLabelFileKey = signal<string | null>(null);
  // Only applicable when labelFileSelectionType == createNew
  protected newLabelFileTemplate = signal<string>('CollectedData');
  protected session = signal<Session | null>(null);
  protected nFrames = signal<number | null>(null);
  protected isProcessing = signal(false);
  exit = output();

  protected handleCloseClick() {
    this.exit.emit();
  }

  handleSelectedSessionChange(session: Session | null) {
    this.session.set(session);
  }

  protected labelFileStepIsValid = computed(() => {
    if (this.labelFileSelectionType() === 'createNew') {
      // further validate
      return (
        this.newLabelFileTemplate() !== null &&
        this.newLabelFileTemplate() !== ''
      );
    }
    if (
      this.labelFileSelectionType() === 'useExisting' &&
      this.existingLabelFileKey() === null
    ) {
      return false;
    }
    return true;
  });

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
  private toExtractFramesRequest(): ExtractFramesRequest {
    // Assume validity. Calls will be guarded by is valid.
    return {
      session: {
        views: this.session()!.views,
      },
      labelFile: {
        // TODO fixme
        //views: this.dialogData.labelFile.views,
        views: [],
      },
      method: 'random',
      options: {
        nFrames: this.nFrames()!,
      },
    };
  }
  private rpc = inject(RpcService);

  handleExtractFramesClick() {
    this.isProcessing.set(true);
    this.rpc
      .call('extractFrames', this.toExtractFramesRequest())
      .then(() => {
        this.handleCloseClick();
      })
      .finally(() => {
        this.isProcessing.set(false);
      });
  }

  protected isNextEnabled = computed(() => {
    if (this.step() === 'labelFile') {
      return this.labelFileStepIsValid();
    }
    if (this.step() === 'session') {
      return this.sessionStepIsValid();
    }
    return false;
  });
}
