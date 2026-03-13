import { inject, Injectable, signal } from '@angular/core';
import { ColorService } from '../infra/color.service';

@Injectable()
export class ViewerViewOptionsService {
  colorService = inject(ColorService);
  videoTileSizePx = signal<number>(250);
  keypointOpacity = signal<number>(1.0);
  keypointSize = signal<number>(this.colorService.defaultSize);
  enableKeypointLabels = signal(false);
}
