import { Injectable } from '@angular/core';
import { hexToRgb, tailwindHexColors } from './tailwindcolors';

@Injectable({
  providedIn: 'root',
})
/** Provides default keypoint rendering constants (color, size, opacity) shared across labeler and viewer. */
export class ColorService {
  defaultColor = hexToRgb(tailwindHexColors['green']['500']);
  defaultSize = 10;
  defaultOpacity = 0.15;
}
