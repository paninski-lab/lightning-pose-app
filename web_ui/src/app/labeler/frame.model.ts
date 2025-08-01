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

  // a mutable array of the labeled keypoints.
  // unlabeled keypoints are omitted.
  // saved files must have all keypoints or no keypoints.
  // if all => regular row in label file.
  // if none => imgpath is saved in unlabeled sidecar.
  keypoints: LKeypoint[];

  // A copy of the original keypoints.
  originalKeypoints: LKeypoint[];
}

export class FVUtils {
  constructor(public frameView: FrameView) {}

  get isFromUnlabeledSet(): boolean {
    return this.frameView.originalKeypoints.length === 0;
  }
  get hasChanges(): boolean {
    return !_.isEqual(
      this.frameView.keypoints,
      this.frameView.originalKeypoints,
    );
  }
}

export function fv(frameView: FrameView) {
  return new FVUtils(frameView);
}
