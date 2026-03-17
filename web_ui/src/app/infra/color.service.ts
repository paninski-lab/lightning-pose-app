import { Injectable } from '@angular/core';
import { hexToRgb, tailwindHexColors } from './tailwindcolors';

@Injectable({
  providedIn: 'root',
})
export class ColorService {
  defaultColor = hexToRgb(tailwindHexColors['green']['500']);
  defaultSize = 10;
  defaultOpacity = 0.15;
}
