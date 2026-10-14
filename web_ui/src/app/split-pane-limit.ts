import { WritableSignal } from '@angular/core';

export const MIN_SEEK_PX = 96;

export function gutterPixels(split: Element): number {
  return [...split.querySelectorAll(':scope > .as-split-gutter')].reduce(
    (sum, gutter) => sum + (gutter as HTMLElement).offsetWidth,
    0,
  );
}

/**
 * angular-split ignores maxSize when the size input is already larger, and a
 * drag updates the pane without updating that input. Setting the size input
 * to the limit refreshes the linked size. When the input is already the limit
 * but the pane is still wider, nudge it so the linked size recomputes.
 */
export function clampSplitPane(
  size: WritableSignal<number>,
  max: WritableSignal<number>,
  nextMax: number,
  clientWidth: number,
) {
  const limit = Math.max(0, Math.floor(nextMax));
  const live = Math.max(size(), clientWidth);
  if (live > limit) {
    if (size() === limit) size.set(limit + 1);
    size.set(limit);
  }
  if (max() !== limit) max.set(limit);
}

/** Padding, the gaps between items, and each item width. The seek item is 96px. */
export function playbackBarMinWidth(
  itemWidths: readonly number[],
  seekIndex: number,
  gap: number,
  padding: number,
): number {
  let width = padding;
  itemWidths.forEach((itemWidth, index) => {
    if (index > 0) width += gap;
    width += index === seekIndex ? MIN_SEEK_PX : itemWidth;
  });
  return Math.ceil(width);
}
