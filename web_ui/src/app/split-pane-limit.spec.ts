import { signal } from '@angular/core';
import { clampSplitPane, playbackBarMinWidth } from './split-pane-limit';

describe('split pane limits', () => {
  it('keeps a pane under the limit, floors an oversized one, and sums the playback bar', () => {
    const size = signal(100);
    const max = signal(10000);

    clampSplitPane(size, max, 250.9, 100);
    expect(size()).toBe(100);
    expect(max()).toBe(250);

    clampSplitPane(size, max, 40.2, 100);
    expect(size()).toBe(40);
    expect(max()).toBe(40);

    size.set(40);
    clampSplitPane(size, max, 40, 80);
    expect(size()).toBe(40);
    expect(max()).toBe(40);

    clampSplitPane(size, max, -5, 10);
    expect(size()).toBe(0);
    expect(max()).toBe(0);

    expect(playbackBarMinWidth([20, 200, 30], 1, 10, 16)).toBe(16 + 20 + 10 + 96 + 10 + 30);
  });
});