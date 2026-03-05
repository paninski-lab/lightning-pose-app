import { Injectable, signal } from '@angular/core';

@Injectable()
export class ViewerViewOptionsService {
  videoTileSizePx = signal<number>(250);
  keypointOpacity = signal<number>(1.0);
  keypointSize = signal<number>(5);
}
