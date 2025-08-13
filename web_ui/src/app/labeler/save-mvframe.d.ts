export interface BackendKeypoint {
  x: number;
  y: number;
  name: string;
}

export interface SaveFrameView {
  csvPath: string;

  // (imgPath in a FrameView)
  indexToChange: string;

  // an array of the keypoint changes.
  changedKeypoints: BackendKeypoint[];
}

export interface SaveMvFrame {
  views: SaveFrameView[];
}
