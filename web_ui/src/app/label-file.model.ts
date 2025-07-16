export interface LabelFile {
  key: string;
  views: LabelFileView[];
}

export interface LabelFileView {
  viewName: string;
  csvPath: string;
}
