import { AbstractControl, ValidationErrors } from '@angular/forms';

/** LP requires `data.image_resize_dims` height and width to be multiples of 128. */
export function multipleOf128(
  control: AbstractControl,
): ValidationErrors | null {
  const value = Number(control.value);
  if (control.value === null || control.value === '') return null;
  return Number.isInteger(value) && value > 0 && value % 128 === 0
    ? null
    : { multipleOf128: true };
}
