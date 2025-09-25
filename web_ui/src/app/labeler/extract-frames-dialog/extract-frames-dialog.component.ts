import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ViewerSessionsPanelComponent } from '../../viewer/viewer-left-panel/viewer-sessions-panel.component';
import { Session } from '../../session.model';
import {
  AbstractControl,
  FormsModule,
  NG_VALIDATORS,
  NgModel,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { RpcService } from '../../rpc.service';
import { ExtractFramesRequest } from '../../extract-frames-request';
import { LabelFilePickerComponent } from '../../label-file-picker/label-file-picker.component';
import { ProjectInfoService } from '../../project-info.service';
import { SessionService } from '../../session.service';

@Directive({
  selector: '[appLabelFileTemplateValidator]',
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: LabelFileTemplateValidatorDirective,
      multi: true,
    },
  ],
})
class LabelFileTemplateValidatorDirective implements Validator {
  private projectInfoService = inject(ProjectInfoService);

  validate(control: AbstractControl): ValidationErrors | null {
    let value: string = control.value;
    if (!value) {
      return null;
    }

    const errors = {} as Record<string, unknown>;

    // If multiview, one star is required.
    if (this.projectInfoService.allViews().length > 0) {
      const starCount = (value.match(/\*/g) || []).length;
      if (starCount === 0) {
        errors['viewStarMissing'] = true;
      }

      // short circuit the rest of the validation if multiple stars
      if (starCount > 1) {
        errors['invalidFilename'] = true;
        return errors;
      }

      // Star should be next to an _ or - delimiter on both sides,
      // unless the star is the last character
      const parts = value.split('*');
      if (!/[-_]$/.test(parts[0])) {
        errors['starNotNextToDelimiter'] = true;
      }

      if (parts[1] && !/^[-_]/.test(parts[1])) {
        errors['starNotNextToDelimiter'] = true;
      }

      value = value.replace('*', this.projectInfoService.allViews()[0]);
    }

    // Allow only alphanumeric, -, _, .
    const allowedChars = /^[a-zA-Z0-9][a-zA-Z0-9-._]+$/;
    if (!allowedChars.test(value)) {
      errors['invalidFilename'] = true;
    }

    // Rule 3: No .csv extension
    if (value.toLowerCase().endsWith('.csv')) {
      errors['hasCSV'] = true;
    }

    return Object.keys(errors).length === 0 ? null : errors; // All rules passed
  }
}

@Component({
  selector: 'app-extract-frames-dialog',
  imports: [
    ViewerSessionsPanelComponent,
    FormsModule,
    LabelFilePickerComponent,
    LabelFileTemplateValidatorDirective,
  ],
  templateUrl: './extract-frames-dialog.component.html',
  styleUrl: './extract-frames-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtractFramesDialogComponent implements OnInit {
  protected step = signal<string>('labelFile');
  protected stepOrder = ['labelFile', 'session', 'settings'];

  initialStep = input<string>('labelFile');
  initialLabelFileSelectionType = input<'createNew' | 'useExisting'>(
    'createNew',
  );
  initialSelectedLabelFileKey = input<string | null>(null);
  private sessionService = inject(SessionService);

  ngOnInit() {
    this.step.set(this.initialStep());
    this.labelFileSelectionType.set(this.initialLabelFileSelectionType());
    this.existingLabelFileKey.set(this.initialSelectedLabelFileKey());
    this.newLabelFileTemplate.set(this.defaultLabelFileTemplate());
  }

  // Form data
  protected labelFileSelectionType = signal<'createNew' | 'useExisting'>(
    'createNew',
  );
  // Only applicable when labelFileSelectionType == useExisting
  protected existingLabelFileKey = signal<string | null>(null);
  // Only applicable when labelFileSelectionType == createNew
  protected newLabelFileTemplate = signal<string>('CollectedData');
  private labelFileTemplateNgModel = viewChild<NgModel>(
    'labelFileTemplateNgModel',
  );
  protected session = signal<Session | null>(null);
  protected nFrames = signal<number | null>(null);
  protected isProcessing = signal(false);
  exit = output();

  private rpc = inject(RpcService);
  private projectInfoService = inject(ProjectInfoService);

  protected handleCloseClick() {
    this.exit.emit();
  }

  handleSelectedSessionChange(session: Session | null) {
    this.session.set(session);
  }

  protected labelFileStepIsValid(): boolean {
    if (this.labelFileSelectionType() === 'createNew') {
      // We are blocked from using computed signals, because
      // NgModel.valid used inside the below will not cache-bust a computed signal.
      return (
        this.newLabelFileTemplate() !== null &&
        this.newLabelFileTemplate() !== '' &&
        (this.labelFileTemplateNgModel()!.valid ?? false)
      );
    }
    if (
      this.labelFileSelectionType() === 'useExisting' &&
      this.existingLabelFileKey() === null
    ) {
      return false;
    }
    return true;
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
  private toExtractFramesRequest(): ExtractFramesRequest {
    // Assume validity. Calls will be guarded by is valid.
    const labelFile = this.sessionService
      .allLabelFiles()
      .find((mvf) => mvf.key === this.existingLabelFileKey());
    const labelFileCreationRequest =
      this.labelFileSelectionType() === 'createNew'
        ? {
            labelFileTemplate: this.newLabelFileTemplate(),
          }
        : null;
    return {
      labelFileCreationRequest,
      session: {
        views: this.session()!.views,
      },
      labelFile: {
        views: labelFile ? labelFile.views : null,
      },
      method: 'random',
      options: {
        nFrames: this.nFrames()!,
      },
    };
  }

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

  protected isNextEnabled(): boolean {
    if (this.step() === 'labelFile') {
      // We are blocked from using computed signals, because
      // NgModel.valid used inside the below will not cache-bust a computed signal.
      return this.labelFileStepIsValid();
    }
    if (this.step() === 'session') {
      return this.sessionStepIsValid();
    }
    return false;
  }

  protected defaultLabelFileTemplate(): string {
    return this.isMultiviewProject() ? 'CollectedData_*' : 'CollectedData.csv';
  }

  protected isMultiviewProject() {
    return this.projectInfoService.projectInfo.views.length > 1;
  }
}
