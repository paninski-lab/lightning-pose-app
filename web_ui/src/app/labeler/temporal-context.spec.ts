import {
  CONTEXT_CENTER_INDEX,
  CONTEXT_SLOT_COUNT,
  CONTEXT_SLOT_LABELS,
  contextFrameOffsets,
  contextImgPaths,
  contextShowingText,
  playContextSlot,
  stepContextSlot,
} from './temporal-context';

describe('contextImgPaths (matches LP get_context_img_paths)', () => {
  const dir = 'labeled-data/session1';
  const frame = (n: string) => `${dir}/img${n}.png`;

  it('gives n-2 … n+2 with the current frame in slot 2', () => {
    expect(contextImgPaths(frame('00000042'))).toEqual([
      frame('00000040'),
      frame('00000041'),
      frame('00000042'),
      frame('00000043'),
      frame('00000044'),
    ]);
  });

  it('floors indices at 0 for frame 0', () => {
    expect(contextImgPaths(frame('00000000'))).toEqual([
      frame('00000000'),
      frame('00000000'),
      frame('00000000'),
      frame('00000001'),
      frame('00000002'),
    ]);
  });

  it('floors indices at 0 for frame 1', () => {
    expect(contextImgPaths(frame('00000001'))).toEqual([
      frame('00000000'),
      frame('00000000'),
      frame('00000001'),
      frame('00000002'),
      frame('00000003'),
    ]);
  });

  it('returns null when the file name has no digits', () => {
    expect(contextImgPaths(`${dir}/frame_a.png`)).toBeNull();
  });

  it('ignores digits in the directory and the extension', () => {
    expect(contextImgPaths('labeled-data/mouse7/frame_a.mp4')).toBeNull();
    expect(contextImgPaths('labeled-data/mouse7/img05.png')?.[0]).toBe(
      'labeled-data/mouse7/img03.png',
    );
  });

  it('uses the first run of digits in the name', () => {
    expect(contextImgPaths(`${dir}/cam2_frame10.png`)).toEqual([
      `${dir}/cam0_frame10.png`,
      `${dir}/cam1_frame10.png`,
      `${dir}/cam2_frame10.png`,
      `${dir}/cam3_frame10.png`,
      `${dir}/cam4_frame10.png`,
    ]);
  });

  it('replaces every occurrence of the frame digits, as str.replace does', () => {
    expect(contextImgPaths(`${dir}/img12_12.png`)?.[0]).toBe(
      `${dir}/img10_10.png`,
    );
  });

  it('keeps the zero padding and grows past it like zfill', () => {
    expect(contextImgPaths(`${dir}/img99.png`)?.[4]).toBe(`${dir}/img101.png`);
  });
});

describe('context slot stepping', () => {
  it('steps one slot and stops at the ends', () => {
    expect(stepContextSlot(2, 1)).toBe(3);
    expect(stepContextSlot(2, -1)).toBe(1);
    expect(stepContextSlot(4, 1)).toBe(4);
    expect(stepContextSlot(0, -1)).toBe(0);
  });

  it('plays −2 … +2 and back without repeating an end slot', () => {
    let state: { slot: number; direction: 1 | -1 } = {
      slot: 0,
      direction: 1,
    };
    const slots = [state.slot];
    for (let i = 0; i < 9; i++) {
      state = playContextSlot(state.slot, state.direction);
      slots.push(state.slot);
    }
    expect(slots).toEqual([0, 1, 2, 3, 4, 3, 2, 1, 0, 1]);
  });

  it('continues from wherever playback was paused', () => {
    expect(playContextSlot(2, -1)).toEqual({ slot: 1, direction: -1 });
  });

  it('labels each slot relative to the current frame', () => {
    expect(CONTEXT_SLOT_LABELS[CONTEXT_CENTER_INDEX]).toBe('current');
    expect(CONTEXT_SLOT_LABELS.length).toBe(CONTEXT_SLOT_COUNT);
  });
});

describe('contextFrameOffsets', () => {
  it('gives each slot its own offset away from the start of a video', () => {
    expect(contextFrameOffsets('labeled-data/s/img00000042.png')).toEqual([
      -2, -1, 0, 1, 2,
    ]);
  });

  it('floors at frame 0 like LP', () => {
    expect(contextFrameOffsets('labeled-data/s/img00000000.png')).toEqual([
      0, 0, 0, 1, 2,
    ]);
    expect(contextFrameOffsets('labeled-data/s/img00000001.png')).toEqual([
      -1, -1, 0, 1, 2,
    ]);
  });

  it('returns null without a frame number', () => {
    expect(contextFrameOffsets('labeled-data/s/frame_a.png')).toBeNull();
  });
});

describe('contextShowingText', () => {
  it('names the slot when it shows its own frame', () => {
    expect(contextShowingText(3, { shownOffset: 1, substitute: null })).toBe(
      'Showing: +1',
    );
    expect(contextShowingText(2, null)).toBe('Showing: current');
  });

  it('names the frame shown before the start of the video', () => {
    expect(
      contextShowingText(0, { shownOffset: 0, substitute: 'before-start' }),
    ).toBe('Showing: current in place of −2 (before the video starts)');
    expect(
      contextShowingText(0, { shownOffset: -1, substitute: 'before-start' }),
    ).toBe('Showing: −1 in place of −2 (before the video starts)');
  });

  it('names the frame shown in place of one that was not found', () => {
    expect(
      contextShowingText(4, { shownOffset: 0, substitute: 'not-found' }),
    ).toBe('Showing: current in place of +2 (not found)');
  });
});
