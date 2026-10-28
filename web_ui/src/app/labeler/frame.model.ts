import { LKeypoint, lkp } from './types';
import _ from 'lodash';

export interface MVFrame {
  key: string;
  views: FrameView[];
}

export interface FrameView {
  viewName: string;

  // this is the relpath from the CSV file
  // (relative to data_dir)
  imgPath: string;

  // a mutable array of the keypoints.
  keypoints: LKeypoint[];

  // immutable copy of the original keypoints. null if from unlabeled file.
  originalKeypoints: LKeypoint[] | null;
}

export class FVUtils {
  constructor(public frameView: FrameView) {}

  get isFromUnlabeledSet(): boolean {
    return this.frameView.originalKeypoints === null;
  }
  get hasChanges(): boolean {
    return !_.isEqual(
      this.frameView.keypoints,
      this.frameView.originalKeypoints,
    );
  }

  /** True when at least one keypoint in this view is placed. */
  get hasPlacedKeypoints(): boolean {
    return this.frameView.keypoints.some((kp) => !lkp(kp).isNaN());
  }

  /** Unplaces every keypoint in this view. Nothing is saved; Revert undoes it. */
  clearKeypoints(): void {
    this.frameView.keypoints = this.frameView.keypoints.map((kp) => ({
      ...kp,
      x: NaN,
      y: NaN,
    }));
  }

  get changedKeypoints(): LKeypoint[] {
    return this.frameView.keypoints.filter((kp) => {
      const okp =
        this.frameView.originalKeypoints?.find(
          (okp) => okp.keypointName === kp.keypointName,
        ) ?? null;
      return okp === null || !_.isEqual(okp, kp);
    });
  }
}

export function fv(frameView: FrameView) {
  return new FVUtils(frameView);
}

export class MVFUtils {
  constructor(public mvFrame: MVFrame) {}

  get isFromUnlabeledSet(): boolean {
    if (!this.mvFrame.views.length) {
      throw new Error('No views available in MVFrame');
    }
    return fv(this.mvFrame.views[0]).isFromUnlabeledSet;
  }
  get hasChanges(): boolean {
    if (!this.mvFrame.views.length) {
      throw new Error('No views available in MVFrame');
    }
    return this.mvFrame.views.some((view) => fv(view).hasChanges);
  }

  /** Edits that Revert can undo. Unlabeled frames count only placed points,
   * because originalKeypoints is null even when every point is still empty. */
  get hasRevertibleEdits(): boolean {
    if (!this.mvFrame.views.length) {
      throw new Error('No views available in MVFrame');
    }
    if (this.isFromUnlabeledSet) {
      return this.mvFrame.views.some((view) =>
        view.keypoints.some((kp) => !lkp(kp).isNaN()),
      );
    }
    return this.hasChanges;
  }

  /** Labeled frames return to the saved points. Unlabeled frames drop every
   * point and stay out of the label file. */
  revertEdits(): void {
    if (!this.mvFrame.views.length) {
      throw new Error('No views available in MVFrame');
    }
    if (this.isFromUnlabeledSet) {
      for (const view of this.mvFrame.views) {
        view.keypoints = view.keypoints.map((kp) => ({
          ...kp,
          x: NaN,
          y: NaN,
        }));
      }
      return;
    }
    for (const view of this.mvFrame.views) {
      const saved = view.originalKeypoints;
      if (!saved) continue;
      view.keypoints = structuredClone(saved);
    }
  }

  /** Returns the version that would result on save:
   * original keypoints and keypoints match (hasChanges => false).
   */
  toSavedMvf(): MVFrame {
    return {
      ...this.mvFrame,
      views: this.mvFrame.views.map((frameView) => {
        return { ...frameView, originalKeypoints: frameView.keypoints };
      }),
    };
  }

  /** Autolabel session key is modified from the normal session key.
   * Regular session key has * in place of view. Autolabel session key
   * has * part removed because it's not valid in filesystem.
   */
  get autolabelSessionKey(): string | null {
    const pathParts = this.mvFrame.key.split('/');
    if (pathParts.length < 3) return null; // unable to parse
    const sessionKeyWithStar = pathParts.at(-2)!;
    if (sessionKeyWithStar.indexOf('*') === -1) return null;

    // Split the session key on "." to handle cases like a-view.b.c
    const processPart = (part: string) => {
      if (part.indexOf('*') === -1) return part;
      const partsHyphenSplit = part.split('-');
      const partsUnderscoreSplit = part.split('_');
      if (partsHyphenSplit.indexOf('*') !== -1) {
        return partsHyphenSplit.filter((p) => p !== '*').join('-');
      } else if (partsUnderscoreSplit.indexOf('*') !== -1) {
        return partsUnderscoreSplit.filter((p) => p !== '*').join('_');
      } else {
        return null; // unrecognized delimiter
      }
    };
    const processedParts = sessionKeyWithStar.split('.').map(processPart);
    if (processedParts.indexOf(null) !== -1) return null;
    return processedParts.filter(Boolean).join('.');
  }
}

export function mvf(mvFrame: MVFrame) {
  return new MVFUtils(mvFrame);
}
