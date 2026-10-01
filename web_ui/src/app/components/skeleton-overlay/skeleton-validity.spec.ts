import {
  clampSkeletonThickness,
  formatSkeletonThickness,
  skeletonProblems,
} from './skeleton-validity';

describe('skeletonProblems', () => {
  const names = ['nose', 'neck', 'tail'];

  it('names a self-pair, an unknown keypoint, a repeated pair, and a bad shape', () => {
    expect(skeletonProblems([['nose', 'nose']], names)[0]).toContain('nose');
    expect(skeletonProblems([['nose', 'ghost']], names).join(' ')).toContain(
      'ghost',
    );
    expect(
      skeletonProblems(
        [
          ['nose', 'neck'],
          ['neck', 'nose'],
        ],
        names,
      ).join(' '),
    ).toContain('nose');
    expect(skeletonProblems('nose', names)[0]).toContain('list');
    expect(skeletonProblems([['nose']], names)[0]).toContain('two');
  });

  it('clamps stored thickness to 0–5 px', () => {
    expect(clampSkeletonThickness(8)).toBe(5);
    expect(clampSkeletonThickness(-1)).toBe(0);
    expect(clampSkeletonThickness(2.5)).toBe(2.5);
  });

  it('formats thickness without float noise', () => {
    expect(formatSkeletonThickness(2)).toBe('2px');
    expect(formatSkeletonThickness(1.25)).toBe('1.25px');
  });

  it('is quiet for a valid list, a missing key, and an empty list', () => {
    expect(
      skeletonProblems(
        [
          ['nose', 'neck'],
          ['nose', 'tail'],
        ],
        names,
      ),
    ).toEqual([]);
    expect(skeletonProblems([['nose', 'neck']], names)).toEqual([]);
    expect(skeletonProblems(null, names)).toEqual([]);
    expect(skeletonProblems(undefined, names)).toEqual([]);
    expect(skeletonProblems([], names)).toEqual([]);
  });
});
