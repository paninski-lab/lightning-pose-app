/**
 * Compares two arrays of strings for deep equality, respecting the order of elements.
 * @param prev The previous array.
 * @param curr The current array.
 * @returns true if the arrays are considered the same, false otherwise.
 */
export const compareStringArraysOrdered = (
  prev: string[],
  curr: string[],
): boolean => {
  if (prev.length !== curr.length) {
    return false;
  }
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== curr[i]) {
      return false;
    }
  }
  return true;
};
