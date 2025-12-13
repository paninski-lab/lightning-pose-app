import {
  ChangeDetectionStrategy,
  Component,
  effect,
  forwardRef,
  inject,
  input,
  model,
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
export class LabelFilePickerComponent implements ControlValueAccessor {
  labelFileKey = model<string | null>(null);
  sessionService = inject(SessionService);
  selectSizeClass = input<string>('select-sm');

  // ControlValueAccessor callbacks
  onChange: (value: string | null) => void = () => {};
  onTouched: () => void = () => {};
  isDisabled = false;

  handleSelectLabelFile(value: string) {
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
    this.isDisabled = isDisabled;
  }
}
