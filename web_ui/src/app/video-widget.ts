import { Keypoint } from './keypoint';
import { Signal } from '@angular/core';

export interface VideoWidget {
  id: string;
  videoSrc: string;
  keypoints: Signal<Keypoint[]>;
}
