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

/**
 * Creates a comparator function for sorting session views based on the specified order.
 *
 * @param {string[]} allViewsOrder - An array that defines the desired order of view names.
 * @returns {function} A comparator function that takes two `SessionView` objects and returns a number indicating their sort order.
 *
 * The returned comparator:
 * - Compares the `viewName` of two `SessionView` objects by their index in the `allViewsOrder` array.
 * - If a `viewName` does not exist in `allViewsOrder`, it is considered greater and pushed to the end.
 * - Returns `0` if both `viewName`s are not in `allViewsOrder`.
 */
export const createSessionViewComparator = (allViewsOrder: string[]) => {
  return (a: { viewName: string }, b: { viewName: string }): number => {
    const indexA = allViewsOrder.indexOf(a.viewName);
    const indexB = allViewsOrder.indexOf(b.viewName);

    // Handle cases where a viewName might not be in allViewsOrder
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;

    return indexA - indexB;
  };
};
