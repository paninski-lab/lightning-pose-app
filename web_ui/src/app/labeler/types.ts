import { MultiView } from '../multiview.model';

export interface LKeypoint {
  x: number;
  y: number;
  keypointName: string;
}
export interface SaveActionData {
  changedKeypoints: MultiView<LKeypoint[]>;
  options: { continue?: boolean };
}
