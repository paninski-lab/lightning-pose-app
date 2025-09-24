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
  // only present if using existing label file (not creating new)
  views: EFRLabelFileView[] | null;
}

export interface EFRRandomOptions {
  nFrames: number;
}

export interface LabelFileCreationRequest {
  labelFileTemplate: string;
}

export interface ExtractFramesRequest {
  labelFileCreationRequest: LabelFileCreationRequest | null;
  session: EFRSession;
  labelFile: EFRLabelFile;
  method: 'random' | 'active';
  options: EFRRandomOptions;
}
