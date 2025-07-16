export interface Frame {
  key: string;
  views: FrameView[];
}

export interface FrameView {
  viewName: string;
  imgPath: string;
}
