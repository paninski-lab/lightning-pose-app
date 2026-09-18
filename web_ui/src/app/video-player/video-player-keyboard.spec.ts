import { viewerPlaybackActionFromKeyboard } from './video-player-keyboard';

describe('viewerPlaybackActionFromKeyboard', () => {
  afterEach(() => {
    document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
  });

  function keydown(
    key: string,
    init: KeyboardEventInit = {},
    target?: EventTarget,
  ) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    if (target) {
      Object.defineProperty(event, 'target', { value: target });
    }
    return event;
  }

  it('maps space to play/pause', () => {
    expect(viewerPlaybackActionFromKeyboard(keydown(' '))).toEqual({
      type: 'togglePlay',
    });
  });

  it('maps arrows to single-frame steps', () => {
    expect(viewerPlaybackActionFromKeyboard(keydown('ArrowLeft'))).toEqual({
      type: 'stepFrame',
      delta: -1,
    });
    expect(viewerPlaybackActionFromKeyboard(keydown('ArrowRight'))).toEqual({
      type: 'stepFrame',
      delta: 1,
    });
  });

  it('maps Shift+Arrow to 10-frame jumps', () => {
    expect(
      viewerPlaybackActionFromKeyboard(keydown('ArrowLeft', { shiftKey: true })),
    ).toEqual({ type: 'stepFrame', delta: -10 });
    expect(
      viewerPlaybackActionFromKeyboard(
        keydown('ArrowRight', { shiftKey: true }),
      ),
    ).toEqual({ type: 'stepFrame', delta: 10 });
  });

  it('maps Home and End', () => {
    expect(viewerPlaybackActionFromKeyboard(keydown('Home'))).toEqual({
      type: 'seekToStart',
    });
    expect(viewerPlaybackActionFromKeyboard(keydown('End'))).toEqual({
      type: 'seekToEnd',
    });
  });

  it('maps - and =/+ to speed nudges', () => {
    expect(viewerPlaybackActionFromKeyboard(keydown('-'))).toEqual({
      type: 'nudgeRate',
      direction: -1,
    });
    expect(viewerPlaybackActionFromKeyboard(keydown('='))).toEqual({
      type: 'nudgeRate',
      direction: 1,
    });
    expect(viewerPlaybackActionFromKeyboard(keydown('+'))).toEqual({
      type: 'nudgeRate',
      direction: 1,
    });
    expect(
      viewerPlaybackActionFromKeyboard(
        keydown('+', { code: 'NumpadAdd', shiftKey: false }),
      ),
    ).toEqual({ type: 'nudgeRate', direction: 1 });
  });

  it('ignores chords with ctrl/meta/alt', () => {
    expect(
      viewerPlaybackActionFromKeyboard(keydown(' ', { ctrlKey: true })),
    ).toBeNull();
    expect(
      viewerPlaybackActionFromKeyboard(keydown('ArrowRight', { metaKey: true })),
    ).toBeNull();
    expect(
      viewerPlaybackActionFromKeyboard(keydown('Home', { altKey: true })),
    ).toBeNull();
  });

  it('ignores shortcuts while a dialog is open', () => {
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    dialog.show();
    expect(viewerPlaybackActionFromKeyboard(keydown(' '))).toBeNull();
    expect(viewerPlaybackActionFromKeyboard(keydown('ArrowRight'))).toBeNull();
  });

  it('ignores keys in a text input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    expect(viewerPlaybackActionFromKeyboard(keydown(' ', {}, input))).toBeNull();
    expect(
      viewerPlaybackActionFromKeyboard(keydown('ArrowRight', {}, input)),
    ).toBeNull();
    expect(viewerPlaybackActionFromKeyboard(keydown('-', {}, input))).toBeNull();
  });

  it('does not steal Space from a focused button', () => {
    const button = document.createElement('button');
    expect(
      viewerPlaybackActionFromKeyboard(keydown(' ', {}, button)),
    ).toBeNull();
    expect(
      viewerPlaybackActionFromKeyboard(keydown('ArrowRight', {}, button)),
    ).toEqual({ type: 'stepFrame', delta: 1 });
  });

  it('leaves arrow keys to a focused range slider', () => {
    const range = document.createElement('input');
    range.type = 'range';
    expect(
      viewerPlaybackActionFromKeyboard(keydown('ArrowLeft', {}, range)),
    ).toBeNull();
    expect(
      viewerPlaybackActionFromKeyboard(keydown('Home', {}, range)),
    ).toBeNull();
    expect(
      viewerPlaybackActionFromKeyboard(keydown(' ', {}, range)),
    ).toEqual({ type: 'togglePlay' });
  });
});
