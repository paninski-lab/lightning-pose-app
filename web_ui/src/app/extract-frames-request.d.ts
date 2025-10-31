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

export interface EFRRandomOptions {
  nFrames: number;
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
  method: 'random' | 'active';
  options: EFRRandomOptions;
}
