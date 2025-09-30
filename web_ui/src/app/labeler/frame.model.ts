import { LKeypoint } from './types';
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
    const parts = this.mvFrame.key.split('/');
    if (parts.length < 3) return null; // unable to parse
    const sessionKeyWithStar = parts.at(-2)!;
    if (!sessionKeyWithStar?.indexOf('*')) return null;
    const partsHyphenSplit = sessionKeyWithStar.split('-');
    const partsUnderscoreSplit = sessionKeyWithStar.split('_');
    if (partsHyphenSplit.indexOf('*') !== -1) {
      return partsHyphenSplit.filter((p) => p !== '*').join('-');
    } else if (partsUnderscoreSplit.indexOf('*') !== -1) {
      return partsUnderscoreSplit.filter((p) => p !== '*').join('_');
    } else {
      return null; // unrecognized delimeter
    }
  }
}

export function mvf(mvFrame: MVFrame) {
  return new MVFUtils(mvFrame);
}
