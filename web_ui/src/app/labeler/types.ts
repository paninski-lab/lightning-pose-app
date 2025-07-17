export interface LKeypoint {
  x: number;
  y: number;
  keypointName: string;
}
export interface SaveActionData {
  changedKeypoints: Record<string, LKeypoint[]>;
  options: { continue?: boolean };
}
