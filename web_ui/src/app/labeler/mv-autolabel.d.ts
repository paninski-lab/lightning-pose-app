export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

export interface KPLabel {
  view: string;
  point: Point2D;
}

export interface KPProjectedLabel {
  view: string;
  // None if there were not enough labeled views to triangulate.
  originalPoint?: Point2D;
  projectedPoint?: Point2D;
  // Reprojection error, if the point was labeled.
  reprojection_error?: number;
}

export interface KeypointForRequest {
  keypointName: string;
  labels: KPLabel[];
}

export interface KeypointForResponse {
  keypointName: string;
  // none if there were not enough labeled views to triangulate.
  triangulatedPt?: Point3D;
  projections?: KPProjectedLabel[];
}

export interface GetMVAutoLabelsRequest {
  // name of the session with the view stripped out, used to lookup calibration files.
  sessionKey: string;
  keypoints: KeypointForRequest[];
}

export interface GetMVAutoLabelsResponse {
  // New keypoints obtained from triangulation + reprojection.
  // Client should patch their state with these.
  keypoints: KeypointForResponse[];
}
