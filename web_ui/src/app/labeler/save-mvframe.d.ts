import { LKeypoint } from './types';

export interface SaveFrameView {
  csvPath: string;

  // (imgPath in a FrameView)
  indexToChange: string;

  // an array of the keypoint changes.
  changedKeypoints: LKeypoint[];
}

export interface SaveMvFrame {
  views: SaveFrameView[];
}
