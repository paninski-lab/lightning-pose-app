import { LabelFrame, placeKeypointLabels } from './keypoint-label-placement';

describe('placeKeypointLabels', () => {
  const markerSize = 10;
  const openFrame: LabelFrame = { width: 1000, height: 1000 };
  const inset = markerSize - markerSize / 1.15;

  function label(
    id: string,
    x: number,
    y: number,
    w = 12,
    h = 10,
  ) {
    return { id, x, y, w, h };
  }

  it('prefers the lower-right, keeps another corner only while that is blocked, stays in frame, and grows outward', () => {
    const far = placeKeypointLabels(
      [label('bb', 400, 400), label('aa', 100, 100)],
      markerSize,
      openFrame,
      new Map(),
    );
    expect(far.corners.get('aa')).toBe('se');
    expect(far.corners.get('bb')).toBe('se');
    expect(far.offsets.get('aa')).toEqual(far.offsets.get('bb'));

    const close = placeKeypointLabels(
      [label('aa', 100, 100), label('bb', 109, 100)],
      markerSize,
      openFrame,
      new Map(),
    );
    expect(close.corners.get('aa')).toBe('se');
    expect(close.corners.get('bb')).not.toBe('se');

    const stillBlocked = placeKeypointLabels(
      [label('aa', 100, 100), label('bb', 109.5, 100)],
      markerSize,
      openFrame,
      close.corners,
    );
    expect(stillBlocked.corners.get('bb')).toBe(close.corners.get('bb'));

    const freed = placeKeypointLabels(
      [label('aa', 100, 100), label('bb', 110, 100)],
      markerSize,
      openFrame,
      close.corners,
    );
    expect(freed.corners.get('bb')).toBe('se');

    const onMarker = placeKeypointLabels(
      [label('aa', 100, 100), label('bb', 118, 108)],
      markerSize,
      openFrame,
      new Map(),
    );
    expect(onMarker.corners.get('aa')).not.toBe('se');
    const markerCleared = placeKeypointLabels(
      [label('aa', 100, 100), label('bb', 119, 108)],
      markerSize,
      openFrame,
      onMarker.corners,
    );
    expect(markerCleared.corners.get('aa')).toBe('se');

    const frame: LabelFrame = { width: 100, height: 100 };
    const cornered = placeKeypointLabels(
      [label('aa', 95, 95)],
      markerSize,
      frame,
      new Map(),
    );
    expect(cornered.corners.get('aa')).toBe('nw');
    const cornerOffset = cornered.offsets.get('aa')!;
    const boxX = 95 - markerSize / 2 + cornerOffset.left;
    const boxY = 95 - markerSize / 2 + cornerOffset.top;
    expect(boxX).toBeGreaterThanOrEqual(0);
    expect(boxY).toBeGreaterThanOrEqual(0);
    expect(boxX + 12).toBeLessThanOrEqual(frame.width);
    expect(boxY + 10).toBeLessThanOrEqual(frame.height);

    const small = placeKeypointLabels(
      [label('aa', 95, 95, 12, 10)],
      markerSize,
      frame,
      new Map(),
    );
    const large = placeKeypointLabels(
      [label('aa', 95, 95, 30, 24)],
      markerSize,
      frame,
      new Map(),
    );
    expect(small.corners.get('aa')).toBe('nw');
    expect(large.corners.get('aa')).toBe('nw');
    const smallOffset = small.offsets.get('aa')!;
    const largeOffset = large.offsets.get('aa')!;
    expect(smallOffset.left + 12).toBeCloseTo(inset);
    expect(largeOffset.left + 30).toBeCloseTo(inset);
    expect(smallOffset.top + 10).toBeCloseTo(inset);
    expect(largeOffset.top + 24).toBeCloseTo(inset);

    const smallSe = placeKeypointLabels(
      [label('aa', 200, 200, 12, 10)],
      markerSize,
      openFrame,
      new Map(),
    );
    const largeSe = placeKeypointLabels(
      [label('aa', 200, 200, 40, 28)],
      markerSize,
      openFrame,
      new Map(),
    );
    expect(smallSe.corners.get('aa')).toBe('se');
    expect(smallSe.offsets.get('aa')).toEqual(largeSe.offsets.get('aa'));

    const tuck = markerSize / 1.15;
    const stroke = 1;
    const ink = placeKeypointLabels(
      [label('aa', 200, 200, 10 + stroke * 2, 8 + stroke * 2)],
      markerSize,
      openFrame,
      new Map(),
    );
    expect(ink.corners.get('aa')).toBe('se');
    expect(ink.offsets.get('aa')!.left).toBeCloseTo(tuck);
    expect(ink.offsets.get('aa')!.top).toBeCloseTo(tuck);
  });
});