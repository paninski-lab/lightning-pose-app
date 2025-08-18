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

export interface ExtractFramesRequest {
  session: EFRSession;
  labelFile: EFRLabelFile;
}
