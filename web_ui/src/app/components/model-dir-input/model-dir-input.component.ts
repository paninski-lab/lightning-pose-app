import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { PathEditableComponent } from '../path-editable/path-editable.component';

export interface ModelDirValue {
  modelDir: string;
  useDefaultModelDir: boolean;
}

@Component({
  selector: 'app-model-dir-input',
  standalone: true,
  imports: [FormsModule, PathEditableComponent],
  templateUrl: './model-dir-input.component.html',
  styleUrl: './model-dir-input.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ModelDirInputComponent),
      multi: true,
    },
  ],
})
export class ModelDirInputComponent implements ControlValueAccessor {
  // Input signal for data directory to calculate default
  dataDir = input.required<string>();
  newDirMode = input<boolean>(false);

  // Internal signals for state
  protected modelDir = signal('');
  protected useDefaultModelDir = signal(true);
  protected isDisabled = signal(false);

  // Computed default model directory
  protected defaultModelDir = computed(() => {
    const dir = this.dataDir();
    return dir ? `${dir.replace(/\/$/, '')}/models` : '';
  });

  private onChange: (value: ModelDirValue) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // Effect to auto-update modelDir when useDefault is true and dataDir changes
    effect(() => {
      const defaultDir = this.defaultModelDir();
      if (this.useDefaultModelDir()) {
        this.modelDir.set(defaultDir);
        this.notify();
      }
    });
  }

  // --- ControlValueAccessor Implementation ---

  writeValue(value: ModelDirValue | null): void {
    if (value) {
      this.modelDir.set(value.modelDir);
      this.useDefaultModelDir.set(value.useDefaultModelDir);
    }
  }

  registerOnChange(fn: (value: ModelDirValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  // --- UI Handlers ---

  protected onCheckboxChange(useDefault: boolean): void {
    this.useDefaultModelDir.set(useDefault);
    if (useDefault) {
      this.modelDir.set(this.defaultModelDir());
    }
    this.notify();
    this.onTouched();
  }

  protected onInputChange(value: string): void {
    this.modelDir.set(value);
    this.notify();
    this.onTouched();
  }

  private notify(): void {
    this.onChange({
      modelDir: this.modelDir(),
      useDefaultModelDir: this.useDefaultModelDir(),
    });
  }
}
