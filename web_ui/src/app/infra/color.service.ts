import { Injectable } from '@angular/core';
import { SignalState, signalState } from '@ngrx/signals';
import { hexToRgb, tailwindHexColors } from './tailwindcolors';

@Injectable({
  providedIn: 'root',
})
export class ColorService {
  defaultColor = hexToRgb(tailwindHexColors['green']['500']);
  defaultSize = 10;

  private keypointColorMap: SignalState<Record<string, number[]>> = signalState(
    {
      topLeft: [0, 0, 255, 0.5],
    },
  );

  private keypointSizeMap: SignalState<Record<string, number>> = signalState({
    topLeft: 10,
  });

  getKeypointColor(keypointName: string): number[] {
    // @ts-expect-error TS7053
    return this.keypointColorMap[keypointName]?.() ?? this.defaultColor;
  }

  getKeypointSize(keypointName: string): number {
    // @ts-expect-error TS7053
    return this.keypointSizeMap[keypointName]?.() ?? this.defaultSize;
  }
}
