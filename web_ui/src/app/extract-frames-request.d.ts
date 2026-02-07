import { s } from '@angular/cdk/scrolling-module.d-3Rw5UxLk';

export interface EFRSessionView {
  viewName: string;
  videoPath: string;
}

export interface EFRSession {
  views: EFRSessionView[];
}

export interface EFRLabelFileView {
  csvPath: string;
  viewName: string;
}
export interface EFRLabelFile {
  views: EFRLabelFileView[];
}

export interface ExtractedFramePredictionEntry {
  keypoint_name: string;
  x: number;
  y: number;
}

export interface ExtractedFramePredictionList {
  model_name: string;
  date_time: number;
  predictions: ExtractedFramePredictionEntry[];
}

export interface EFRRandomOptions {
  nFrames: number;
}

export interface ManualFrameOptions {
  // list of non-negative, ascending, unique integers.
  frame_index_list: number[];
  predictions?: Record<string, ExtractedFramePredictionList>;
}

export interface LabelFileCreationRequest {
  labelFileTemplate: string;
}

export interface ExtractFramesRequest {
  projectKey: string;
  labelFileCreationRequest: LabelFileCreationRequest | null;
  session: EFRSession;
  // only present if using existing label file (not creating new)
  labelFile: EFRLabelFile | null;
  method: 'random' | 'manual';
  // applicable and required for method=random
  options?: EFRRandomOptions;
  // applicable and required for method=manual
  manualFrameOptions?: ManualFrameOptions;
}
