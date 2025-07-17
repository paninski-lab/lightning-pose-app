import { LKeypoint } from './types';

export interface MVFrame {
  key: string;
  views: FrameView[];
}

export interface FrameView {
  viewName: string;
  imgPath: string;
  keypoints: LKeypoint[];
}
