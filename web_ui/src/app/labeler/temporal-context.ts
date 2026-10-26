/** Slot of the current frame among the five context frames. */
export const CONTEXT_CENTER_INDEX = 2;

/**
 * Paths of the five context frames (n-2 … n+2) for an image path, built the
 * way lightning-pose does (`lightning_pose/utils/io.py:get_context_img_paths`):
 *
 * - The frame number is the first run of digits in the file name (no extension).
 * - Indices below 0 become 0, so frame 0 gives frames [0, 0, 0, 1, 2].
 * - Every occurrence of that digit string in the file name is replaced.
 *
 * Returns null when the file name has no digits; LP builds no context then.
 * A slot whose file does not exist should show the center frame instead
 * (LP's dataset does this); the caller handles that when the image fails to load.
 */
export function contextImgPaths(imgPath: string): string[] | null {
  const parsed = parseFrameName(imgPath);
  if (!parsed) return null;
  const { dir, stem, ext, centerStr } = parsed;
  return contextFrameNumbers(parsed.center).map((index) => {
    const indexStr = String(index).padStart(centerStr.length, '0');
    return dir + stem.split(centerStr).join(indexStr) + ext;
  });
}

/**
 * For each slot, the frame shown relative to the current frame after LP's
 * floor at 0. Frame 1 gives [-1, -1, 0, 1, 2]. Null without a frame number.
 */
export function contextFrameOffsets(imgPath: string): number[] | null {
  const parsed = parseFrameName(imgPath);
  if (!parsed) return null;
  return contextFrameNumbers(parsed.center).map((n) => n - parsed.center);
}

function contextFrameNumbers(center: number): number[] {
  const frames: number[] = [];
  for (let index = center - 2; index <= center + 2; index++) {
    frames.push(Math.max(index, 0));
  }
  return frames;
}

function parseFrameName(imgPath: string) {
  const slash = imgPath.lastIndexOf('/');
  const dir = imgPath.slice(0, slash + 1);
  const name = imgPath.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  // Like Path.stem: a leading dot (".hidden") is part of the stem.
  const hasExt = dot > 0;
  const stem = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : '';

  const match = stem.match(/\d+/);
  if (!match) return null;
  const centerStr = match[0];
  return { dir, stem, ext, centerStr, center: parseInt(centerStr, 10) };
}

/** Number of context slots (n-2 … n+2). */
export const CONTEXT_SLOT_COUNT = 5;

/** What each slot shows, relative to the current frame. */
export const CONTEXT_SLOT_LABELS = ['−2', '−1', 'current', '+1', '+2'];

/** Move one or more slots, stopping at the first and last slot. */
export function stepContextSlot(slot: number, delta: number): number {
  return Math.min(Math.max(slot + delta, 0), CONTEXT_SLOT_COUNT - 1);
}

/**
 * Next slot of the playback loop, which runs −2 … +2 and back.
 * Turns around at either end without repeating the end slot.
 */
export function playContextSlot(
  slot: number,
  direction: 1 | -1,
): { slot: number; direction: 1 | -1 } {
  const next = slot + direction;
  if (next < 0 || next >= CONTEXT_SLOT_COUNT) {
    const turned = direction === 1 ? -1 : 1;
    return { slot: slot + turned, direction: turned };
  }
  return { slot: next, direction };
}

/** Why a slot shows a different frame than its own. */
export type ContextSubstitute = 'before-start' | 'not-found';

/** What one context slot actually shows. */
export interface ContextSlotView {
  /** Frame shown, relative to the current frame (0 is the current frame). */
  shownOffset: number;
  /** Set when the slot's own frame could not be shown. */
  substitute: ContextSubstitute | null;
}

/**
 * Text under the temporal context controls, naming the frame actually shown
 * when a slot shows a substitute, for example
 * "Showing: current in place of +1 (not found)".
 */
export function contextShowingText(
  slot: number,
  view: ContextSlotView | null | undefined,
): string {
  const slotLabel = CONTEXT_SLOT_LABELS[slot];
  if (!view?.substitute) return `Showing: ${slotLabel}`;
  const shownLabel =
    CONTEXT_SLOT_LABELS[view.shownOffset + CONTEXT_CENTER_INDEX];
  const why =
    view.substitute === 'before-start'
      ? 'before the video starts'
      : 'not found';
  return `Showing: ${shownLabel} in place of ${slotLabel} (${why})`;
}
