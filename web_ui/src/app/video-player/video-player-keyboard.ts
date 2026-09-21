export type ViewerPlaybackAction =
  | { type: 'togglePlay' }
  | { type: 'stepFrame'; delta: number }
  | { type: 'seekToStart' }
  | { type: 'seekToEnd' }
  | { type: 'nudgeRate'; direction: -1 | 1 };

/**
 * Map a keydown event to a Viewer playback action, or null if the event
 * should be left to the browser / focused control.
 */
export function viewerPlaybackActionFromKeyboard(
  event: KeyboardEvent,
): ViewerPlaybackAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isDialogOpen()) return null;

  const target = event.target;
  if (isTextEntryTarget(target)) return null;

  const key = event.key;
  const code = event.code;

  if (key === ' ' || key === 'Spacebar' || code === 'Space') {
    if (shouldIgnoreSpace(target)) return null;
    return { type: 'togglePlay' };
  }

  if (isPopoverTarget(target) && isTransportNavKey(key)) {
    return null;
  }

  if (key === 'ArrowLeft') {
    if (isRangeTarget(target)) return null;
    return { type: 'stepFrame', delta: event.shiftKey ? -10 : -1 };
  }
  if (key === 'ArrowRight') {
    if (isRangeTarget(target)) return null;
    return { type: 'stepFrame', delta: event.shiftKey ? 10 : 1 };
  }
  if (key === 'Home') {
    if (isRangeTarget(target)) return null;
    return { type: 'seekToStart' };
  }
  if (key === 'End') {
    if (isRangeTarget(target)) return null;
    return { type: 'seekToEnd' };
  }

  if (isSlowerKey(event)) {
    return { type: 'nudgeRate', direction: -1 };
  }
  if (isFasterKey(event)) {
    return { type: 'nudgeRate', direction: 1 };
  }

  return null;
}

function isSlowerKey(event: KeyboardEvent) {
  return (
    event.key === '-' ||
    event.code === 'Minus' ||
    event.code === 'NumpadSubtract'
  );
}

function isFasterKey(event: KeyboardEvent) {
  return (
    event.key === '=' ||
    event.key === '+' ||
    event.code === 'Equal' ||
    event.code === 'NumpadAdd'
  );
}

function isTransportNavKey(key: string) {
  return (
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'Home' ||
    key === 'End' ||
    key === ' ' ||
    key === 'Spacebar'
  );
}

function isDialogOpen() {
  return document.querySelector('dialog[open]') != null;
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'range',
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'color',
]);

function isButtonLike(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A') return true;
  return target.getAttribute('role') === 'button';
}

function shouldIgnoreSpace(target: EventTarget | null) {
  if (isButtonLike(target) || isPopoverTarget(target)) return true;
  if (target instanceof HTMLInputElement) {
    return (
      target.type === 'checkbox' ||
      target.type === 'radio' ||
      target.type === 'button' ||
      target.type === 'submit' ||
      target.type === 'reset' ||
      target.type === 'file'
    );
  }
  return false;
}

function isRangeTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement && target.type === 'range';
}

function isPopoverTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest('[popover]') != null;
}
