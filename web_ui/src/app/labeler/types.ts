/** L = Labeler */
export interface LKeypoint {
  x: number;
  y: number;
  keypointName: string;
}

export class LKPUtils {
  constructor(public kp: LKeypoint) {}
  isNaN() {
    return isNaN(this.kp.x) || isNaN(this.kp.y);
  }
}

export function lkp(kp: LKeypoint) {
  return new LKPUtils(kp);
}
