import { lpTrainFrameCount, minFramesForPosePca } from './pose-pca';

describe('lpTrainFrameCount', () => {
  it('matches LP split_sizes_from_probabilities for a 95/5 split', () => {
    // LP: floor(0.95 * n) train, floor(0.05 * n) val, leftover < 5 goes to train,
    // and one frame moves to val when val would be empty.
    expect(lpTrainFrameCount(10, 0.95, 0.05)).toBe(9);
    expect(lpTrainFrameCount(20, 0.95, 0.05)).toBe(19);
    expect(lpTrainFrameCount(21, 0.95, 0.05)).toBe(20);
    expect(lpTrainFrameCount(100, 0.95, 0.05)).toBe(95);
  });

  it('is 0 when LP cannot split (one frame)', () => {
    expect(lpTrainFrameCount(1, 0.95, 0.05)).toBe(0);
  });
});

describe('minFramesForPosePca', () => {
  it('needs 2 training frames per keypoint', () => {
    // 17 keypoints: 34 dimensions. 36 frames give 35 train; 35 frames give 34.
    expect(minFramesForPosePca(17, 0.95, 0.05)).toBe(35);
    expect(lpTrainFrameCount(35, 0.95, 0.05)).toBe(34);
    expect(lpTrainFrameCount(34, 0.95, 0.05)).toBe(33);
  });

  it('needs more frames with a smaller train fraction', () => {
    const n = minFramesForPosePca(10, 0.8, 0.2);
    expect(lpTrainFrameCount(n, 0.8, 0.2)).toBeGreaterThanOrEqual(20);
    expect(lpTrainFrameCount(n - 1, 0.8, 0.2)).toBeLessThan(20);
    expect(n).toBe(24);
  });
});
