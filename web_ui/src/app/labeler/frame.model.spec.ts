import { mvf, MVFrame } from './frame.model';

describe('MVFUtils.revertEdits', () => {
  it('reverts labeled frames to saved keypoints and clears unlabeled frames', () => {
    const saved = { keypointName: 'nose', x: 1, y: 2 };
    const labeled: MVFrame = {
      key: 'labeled',
      views: [
        {
          viewName: 'camA',
          imgPath: 'a.png',
          keypoints: [{ keypointName: 'nose', x: 9, y: 9 }],
          originalKeypoints: [{ ...saved }],
        },
      ],
    };

    const labeledFrame = mvf(labeled);
    expect(labeledFrame.hasRevertibleEdits).toBe(true);
    labeledFrame.revertEdits();
    const savedCopy = labeled.views[0].originalKeypoints!;
    expect(labeled.views[0].keypoints).toEqual([saved]);
    expect(labeled.views[0].keypoints).not.toBe(savedCopy);
    expect(labeledFrame.hasRevertibleEdits).toBe(false);
    labeled.views[0].keypoints[0].x = 4;
    expect(savedCopy[0].x).toBe(1);

    const unlabeled: MVFrame = {
      key: 'unlabeled',
      views: [
        {
          viewName: 'camA',
          imgPath: 'b.png',
          keypoints: [{ keypointName: 'nose', x: 3, y: 4 }],
          originalKeypoints: null,
        },
      ],
    };
    const unlabeledFrame = mvf(unlabeled);
    expect(unlabeledFrame.hasRevertibleEdits).toBe(true);
    unlabeledFrame.revertEdits();
    expect(unlabeled.views[0].keypoints).toEqual([
      { keypointName: 'nose', x: NaN, y: NaN },
    ]);
    expect(unlabeled.views[0].originalKeypoints).toBeNull();
    expect(unlabeledFrame.hasRevertibleEdits).toBe(false);
  });
});
