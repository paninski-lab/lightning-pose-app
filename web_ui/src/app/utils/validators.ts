import {
  AbstractControl,
  FormArray,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';

export function mustBeInOptionsList<T>(
  optionsGetterGetter: () => () => T[],
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (optionsGetterGetter() === undefined) {
      // signal not yet initialized
      return null;
    }
    const optionsGetter = optionsGetterGetter();
    const selectedItem = control.value as T | undefined;
    const currentOptions = optionsGetter();

    // If the control value is null/undefined, validation passes
    // (rely on Validators.required for ensuring a selection exists)
    if (!selectedItem) {
      return null;
    }

    const found = currentOptions.some((item) => item === selectedItem);

    // If the item is not found, return an error object with a key 'notInOptions'
    return found ? null : { notInOptions: true };
  };
}
export function atLeastOneTrueValidator(
  shouldApply?: () => boolean,
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (control instanceof FormArray && shouldApply?.()) {
      const formArray = control as FormArray;
      const isAtLeastOneTrue = formArray.controls.some((c) => c.value === true);
      return isAtLeastOneTrue ? null : { atLeastOneTrue: true };
    }
    return null;
  };
}

/**
 * Custom FormGroup Validator: Ensures the sum of values in a form group is 1.
 * Uses a small epsilon (0.0001) for reliable floating-point comparison.
 */
export function sumToOneValidator(
  control: AbstractControl,
): ValidationErrors | null {
  // Get all controls in the form group
  const controls = Object.values((control as FormGroup).controls || {});

  // If there are no controls, return null
  if (controls.length === 0) {
    return null;
  }

  // Check if all values are numbers and not null
  const values = controls.map((c) => c.value);
  if (values.some((v) => v === null || typeof v !== 'number')) {
    return null;
  }

  // Sum all values
  const sum = values.reduce((acc, curr) => acc + curr, 0);
  const epsilon = 0.0001; // Tolerance for floating point math

  if (Math.abs(sum - 1) > epsilon) {
    return { sumMustBeOne: true };
  }

  return null;
}

export function fileNameValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const allowedChars = /^[a-zA-Z0-9][a-zA-Z0-9-._]+$/;
  if (!allowedChars.test(control.value)) {
    return { invalidFilename: true };
  }
  return null;
}
