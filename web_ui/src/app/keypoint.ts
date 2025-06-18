import { Point } from '@angular/cdk/drag-drop';
import { Signal } from '@angular/core';

/**
 * Represents a single keypoint displayed in KeypointContainerComponent.
 */
export interface Keypoint {
  id: string; // must be unique per widget
  hoverText: string;
  position: Signal<Point>;
  colorClass: Signal<string>;
}

export interface KeypointImpl extends Keypoint {
  name: string;
  modelKey: string;
}
