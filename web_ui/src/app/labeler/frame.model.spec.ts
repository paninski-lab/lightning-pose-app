import { fv, mvf, MVFrame } from './frame.model';

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

describe('FVUtils.clearKeypoints', () => {
  it('empties one view, marks the frame edited, leaves other views alone, and Revert restores it', () => {
    const top = [
      { keypointName: 'nose', x: 1, y: 2 },
      { keypointName: 'tail', x: 3, y: 4 },
    ];
    const side = [{ keypointName: 'nose', x: 5, y: 6 }];
    const frame: MVFrame = {
      key: 'f',
      views: [
        {
          viewName: 'top',
          imgPath: 't.png',
          keypoints: structuredClone(top),
          originalKeypoints: structuredClone(top),
        },
        {
          viewName: 'side',
          imgPath: 's.png',
          keypoints: structuredClone(side),
          originalKeypoints: structuredClone(side),
        },
      ],
    };

    expect(mvf(frame).hasChanges).toBeFalse();
    fv(frame.views[0]).clearKeypoints();

    expect(frame.views[0].keypoints.map((kp) => [kp.x, kp.y])).toEqual([
      [NaN, NaN],
      [NaN, NaN],
    ]);
    expect(fv(frame.views[0]).hasPlacedKeypoints).toBeFalse();
    expect(frame.views[1].keypoints).toEqual(side);
    expect(mvf(frame).hasChanges).toBeTrue();

    mvf(frame).revertEdits();
    expect(frame.views[0].keypoints).toEqual(top);
  });
});
