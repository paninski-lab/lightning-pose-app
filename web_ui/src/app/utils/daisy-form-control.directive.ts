import {
  Directive,
  inject,
  DoCheck,
  ElementRef,
  Renderer2,
} from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * DaisyUI Form Error Directive
 *
 * This directive automatically applies the correct daisyUI error class ('input-error' or 'select-error')
 * to a form control element if the associated FormControl is both invalid and has been touched or dirtied.
 *
 * Selector: Targets elements with [formControl] or [formControlName] bindings.
 */
@Directive({
  selector:
    // eslint-disable-next-line @angular-eslint/directive-selector
    '[formControl]:not([ngNoValidate]), [formControlName]:not([ngNoValidate])',
  standalone: true,
})
export class DaisyFormControlDirective implements DoCheck {
  private ngControl = inject(NgControl);
  private el = inject(ElementRef);
  private renderer = inject(Renderer2);

  // Caches the specific error class name to use ('input-error' or 'select-error')
  private errorClass: string | null = null;

  // Tracks the current applied state to avoid redundant DOM operations
  private isErrorClassApplied = false;

  ngDoCheck(): void {
    const control = this.ngControl.control;

    if (!control) return;

    // 1. Determine the required error class (only needs to run once)
    if (this.errorClass === null) {
      const classList = this.el.nativeElement.className.split(/\s+/);

      if (classList.includes('input')) {
        this.errorClass = 'input-error';
      } else if (classList.includes('select')) {
        this.errorClass = 'select-error';
      }

      // If no relevant base class is found, the directive won't apply an error style.
      if (this.errorClass === null) return;
    }

    // 2. Check form control validation state
    // Apply error if invalid AND (touched OR dirty)
    const shouldHaveError =
      control.invalid && (control.touched || control.dirty);

    // 3. Apply or remove the specific error class using Renderer2
    if (this.errorClass) {
      if (shouldHaveError && !this.isErrorClassApplied) {
        this.renderer.addClass(this.el.nativeElement, this.errorClass);
        this.isErrorClassApplied = true;
      } else if (!shouldHaveError && this.isErrorClassApplied) {
        this.renderer.removeClass(this.el.nativeElement, this.errorClass);
        this.isErrorClassApplied = false;
      }
    }
  }
}
