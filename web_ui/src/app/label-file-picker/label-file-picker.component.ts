import {
  ChangeDetectionStrategy,
  Component,
  effect,
  forwardRef,
  inject,
  Input,
  input,
  model,
  OnInit,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-label-file-picker',
  imports: [FormsModule],
  templateUrl: './label-file-picker.component.html',
  styleUrl: './label-file-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LabelFilePickerComponent),
      multi: true,
    },
  ],
})
export class LabelFilePickerComponent implements OnInit, ControlValueAccessor {
  labelFileKey = model<string | null>(null);
  sessionService = inject(SessionService);
  selectSizeClass = input<string>('select-sm');

  // ControlValueAccessor callbacks
  onChange: (value: string | null) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onTouched: () => void = () => {};
  disabled = model(false);

  ngOnInit() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.sessionService.loadLabelFiles().then((_) => {
      if (this.labelFileKey() === null) {
        this.handleSelectLabelFile(this.sessionService.getDefaultLabelFile());
      }
    });
  }

  handleSelectLabelFile(value: string | null) {
    this.labelFileKey.set(value);
    this.onChange(value);
    this.onTouched();
  }

  // WriteValue: called by the Forms API to write to the view when programmatic changes from model to view are requested.
  writeValue(value: string | null): void {
    this.labelFileKey.set(value);
  }

  // RegisterOnChange: registers a callback function that is called when the control's value changes in the UI.
  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  // RegisterOnTouched: registers a callback function that is called by the forms API on initialization to update the form model on blur.
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  // SetDisabledState: called by the forms API when the control status changes to or from 'DISABLED'.
  setDisabledState?(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
