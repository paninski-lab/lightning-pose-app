import { skeletonBones } from './skeleton-bones';

describe('skeletonBones', () => {
  const pair = [['nose', 'neck']] as const;

  it('draws one segment when both ends are on the tile', () => {
    expect(
      skeletonBones(pair, [
        { name: 'nose', x: 1, y: 2 },
        { name: 'neck', x: 3, y: 4 },
      ]),
    ).toEqual([{ x1: 1, y1: 2, x2: 3, y2: 4 }]);
  });

  it('draws nothing when an end is missing, non-finite, or not visible', () => {
    expect(skeletonBones(pair, [{ name: 'nose', x: 1, y: 2 }])).toEqual([]);
    expect(
      skeletonBones(pair, [
        { name: 'nose', x: 1, y: 2 },
        { name: 'neck', x: Number.NaN, y: 4 },
      ]),
    ).toEqual([]);
    expect(
      skeletonBones(pair, [
        { name: 'nose', x: 1, y: 2 },
        { name: 'neck', x: 3, y: 4, visible: false },
      ]),
    ).toEqual([]);
  });

  it('does not connect different models on one tile', () => {
    expect(
      skeletonBones(pair, [
        { name: 'nose', x: 0, y: 0, modelKey: 'a' },
        { name: 'neck', x: 5, y: 5, modelKey: 'b' },
        { name: 'neck', x: 1, y: 1, modelKey: 'a' },
      ]),
    ).toEqual([{ x1: 0, y1: 0, x2: 1, y2: 1 }]);
  });

  it('does not connect keypoints across views', () => {
    expect(
      skeletonBones(pair, [
        { name: 'nose', x: 0, y: 0, view: 'camA' },
        { name: 'neck', x: 1, y: 1, view: 'camA' },
        { name: 'nose', x: 10, y: 10, view: 'camB' },
        { name: 'neck', x: 11, y: 11, view: 'camB' },
      ]),
    ).toEqual([
      { x1: 0, y1: 0, x2: 1, y2: 1 },
      { x1: 10, y1: 10, x2: 11, y2: 11 },
    ]);
  });
});
