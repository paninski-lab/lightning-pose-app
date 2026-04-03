import {
  booleanAttribute,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from './dropdown.component';

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [
    CommonModule,
    DropdownComponent,
    DropdownContentComponent,
    DropdownTriggerComponent,
    DropdownTriggerDirective,
  ],
  host: {
    class: 'not-prose',
  },
  template: `
    <app-dropdown
      #dropdown
      [fullWidth]="fullWidth()"
      [class.opacity-50]="disabled()"
    >
      <app-dropdown-trigger>
        <button
          appDropdownTrigger
          type="button"
          class="select flex justify-between items-center"
          [class.select-sm]="size() === 'sm'"
          [class.select-md]="size() === 'md'"
          [class.select-lg]="size() === 'lg'"
          [class.w-full]="fullWidth()"
          [disabled]="disabled()"
          [class.app-empty-select]="value() === null"
        >
          <span>{{ displayValue() }}</span>
        </button>
      </app-dropdown-trigger>
      <app-dropdown-content
        [class.w-full]="fullWidth()"
        class="w-full min-w-40"
      >
        <ul
          class="menu p-2 w-full max-h-60 overflow-y-auto flex-nowrap"
          [class.menu-sm]="size() === 'sm'"
          tabindex="0"
        >
          @for (option of options(); track option.value) {
            <li>
              <a
                [class.active]="option.value === value()"
                (click)="handleSelect(option.value); dropdown.close()"
                class="whitespace-nowrap"
              >
                {{ option.label }}
              </a>
            </li>
          }
        </ul>
      </app-dropdown-content>
    </app-dropdown>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true,
    },
  ],
})
export class SelectComponent implements ControlValueAccessor {
  options = input<{ label: string; value: any }[]>([]);
  placeholder = input<string>('Select an option');
  size = input<'sm' | 'md' | 'lg'>('md');
  fullWidth = input(false, { transform: booleanAttribute });

  value = signal<any>(null);
  disabled = signal<boolean>(false);

  displayValue = computed(() => {
    const current = this.value();
    const option = this.options().find((o) => o.value === current);
    return option ? option.label : this.placeholder();
  });

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.value.set(value);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  handleSelect(value: any): void {
    if (this.disabled()) return;
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
  }
}
