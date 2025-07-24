import { LKeypoint } from './types';

export interface MVFrame {
  key: string;
  views: FrameView[];
}

export interface FrameView {
  viewName: string;

  // this is the relpath from the CSV file
  // (relative to data_dir)
  imgPath: string;

  // an array of the labeled keypoints.
  // unlabeled keypoints are omitted.
  // (this array will exist but be empty).
  keypoints: LKeypoint[];
}
