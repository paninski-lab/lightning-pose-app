import {
  LabelFrame,
  labelOutlinePad,
  placeKeypointLabels,
} from './keypoint-label-placement';

describe('placeKeypointLabels', () => {
  const markerSize = 10;
  const openFrame: LabelFrame = { width: 1000, height: 1000 };
  const inset = markerSize - markerSize / 1.15;

  function label(id: string, x: number, y: number, w = 12, h = 10) {
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

    // Wide labels overlap while bb's marker stays well away from aa's label,
    // so only the label-on-label rule is in play here.
    const close = placeKeypointLabels(
      [label('aa', 100, 100, 40), label('bb', 130, 95, 40)],
      markerSize,
      openFrame,
      new Map(),
    );
    expect(close.corners.get('aa')).toBe('se');
    expect(close.corners.get('bb')).not.toBe('se');

    const stillBlocked = placeKeypointLabels(
      [label('aa', 100, 100, 40), label('bb', 137.5, 95, 40)],
      markerSize,
      openFrame,
      close.corners,
    );
    expect(stillBlocked.corners.get('bb')).toBe(close.corners.get('bb'));

    const freed = placeKeypointLabels(
      [label('aa', 100, 100, 40), label('bb', 138.5, 95, 40)],
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
    // At x=119 bb's marker grazes the label and is nearer to it than aa's own
    // marker; at x=121 it is neither.
    const markerCleared = placeKeypointLabels(
      [label('aa', 100, 100), label('bb', 121, 108)],
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

  describe('nearer another marker (#154)', () => {
    // aa's lower-right label box spans x 103.7-115.7 and y 103.7-113.7; its
    // corner is about 5.2px from aa's center.
    it('skips a corner that sits nearer another marker than its own', () => {
      // bb's center is 4px right of the label: only grazing it, but nearer.
      const placed = placeKeypointLabels(
        [label('aa', 100, 100), label('bb', 119.7, 108)],
        markerSize,
        openFrame,
        new Map(),
      );
      expect(placed.corners.get('aa')).not.toBe('se');
      const offset = placed.offsets.get('aa')!;
      const box = {
        x: 100 - markerSize / 2 + offset.left,
        y: 100 - markerSize / 2 + offset.top,
      };
      const nearest = (cx: number, cy: number) =>
        Math.hypot(
          cx - Math.max(box.x, Math.min(cx, box.x + 12)),
          cy - Math.max(box.y, Math.min(cy, box.y + 10)),
        );
      expect(nearest(100, 100)).toBeLessThan(nearest(119.7, 108));
    });

    it('keeps the lower-right when the other marker is farther than its own', () => {
      const placed = placeKeypointLabels(
        [label('aa', 100, 100), label('bb', 122, 108)],
        markerSize,
        openFrame,
        new Map(),
      );
      expect(placed.corners.get('aa')).toBe('se');
    });

    it('makes clear which label is which for two markers a few pixels apart', () => {
      const placed = placeKeypointLabels(
        [label('aa', 100, 100), label('bb', 106, 103)],
        markerSize,
        openFrame,
        new Map(),
      );
      for (const [id, x, y, ox, oy] of [
        ['aa', 100, 100, 106, 103],
        ['bb', 106, 103, 100, 100],
      ] as const) {
        const offset = placed.offsets.get(id)!;
        const box = {
          x: x - markerSize / 2 + offset.left,
          y: y - markerSize / 2 + offset.top,
        };
        const dist = (cx: number, cy: number) =>
          Math.hypot(
            cx - Math.max(box.x, Math.min(cx, box.x + 12)),
            cy - Math.max(box.y, Math.min(cy, box.y + 10)),
          );
        expect(dist(x, y)).withContext(id).toBeLessThanOrEqual(dist(ox, oy));
      }
    });
  });
});

describe('label outline', () => {
  it('pads the placement box by the outline width', () => {
    expect(labelOutlinePad(8)).toBe(1);
    expect(labelOutlinePad(2)).toBe(0.25);
  });
});
