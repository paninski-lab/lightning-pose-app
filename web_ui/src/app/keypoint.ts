import { Point } from '@angular/cdk/drag-drop';
import { Signal } from '@angular/core';

/**
 * Represents a single keypoint displayed in KeypointContainerComponent.
 */
export interface Keypoint {
  id: string; // must be unique per widget
  hoverText: string;
  position: Signal<Point>;
  color: Signal<number[]>;
  isVisible?: Signal<boolean>;
}

export interface ViewerKeypoint extends Keypoint {
  name: string;
  modelKey: string;
}
