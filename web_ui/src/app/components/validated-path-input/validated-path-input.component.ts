import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  debounceTime,
  delay,
  Observable,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-validated-path-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './validated-path-input.component.html',
  styleUrl: './validated-path-input.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ValidatedPathInputComponent),
      multi: true,
    },
  ],
})
export class ValidatedPathInputComponent implements ControlValueAccessor {
  label = input<string>('');
  placeholder = input<string>('/');
  description = input<string>('');

  protected value = signal<string>('');
  protected isValid = signal<boolean>(false);
  protected isValidating = signal<boolean>(false);
  protected isValidated = signal<boolean>(false);

  private pathUpdate$ = new Subject<string>();

  constructor() {
    this.pathUpdate$
      .pipe(
        debounceTime(300),
        tap(() => this.isValidating.set(true)),
        switchMap((path) => this.checkPathValidityAsync(path)),
        takeUntilDestroyed(),
      )
      .subscribe((isValid) => {
        this.isValid.set(isValid);
        this.isValidated.set(true);
        this.isValidating.set(false);
      });
  }

  // Fake RPC that returns randomly valid or not with a timer
  private checkPathValidityAsync(path: string): Observable<boolean> {
    if (!path) {
      return of(false);
    }
    // Stub: make it more predictable for testing, valid if it starts with '/'
    const isActuallyValid = path.startsWith('/') && Math.random() > 0.5;
    return of(isActuallyValid).pipe(delay(1000));
  }

  // ControlValueAccessor implementation
  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(value: string): void {
    const val = value || '';
    this.value.set(val);
    this.isValidated.set(false);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    // This will be called by Angular when the form control is disabled
    this.controlIsDisabled.set(isDisabled);
  }

  protected controlIsDisabled = signal<boolean>(false);

  protected handleInput(newValue: string) {
    if (this.controlIsDisabled()) return;
    this.value.set(newValue);
    this.isValidated.set(false);
    this.pathUpdate$.next(newValue);
    this.onChange(newValue);
  }
}
