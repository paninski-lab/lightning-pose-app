import { Injectable, Signal, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ColorService {
  readonly keypointColorMap = signalState({
    topLeft: 'rgba(0, 0, 255, 0.5)',
  });
}
