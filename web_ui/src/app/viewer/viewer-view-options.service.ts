import { inject, Injectable, signal, computed, effect } from '@angular/core';
import { ColorService } from '../infra/color.service';

const DEFAULT_VIDEO_TILE_SIZE = 250;
const DEFAULT_OPACITY = 1.0;

@Injectable()
export class ViewerViewOptionsService {
  colorService = inject(ColorService);

  videoTileSizePx = signal<number>(
    Number(localStorage.getItem('viewer-view-options.video-tile-size')) ||
      DEFAULT_VIDEO_TILE_SIZE,
  );
  keypointOpacity = signal<number>(
    Number(localStorage.getItem('viewer-view-options.opacity')) ||
      DEFAULT_OPACITY,
  );
  keypointSize = signal<number>(
    Number(localStorage.getItem('viewer-view-options.size')) ||
      this.colorService.defaultSize,
  );
  enableKeypointLabels = signal(false);

  isVideoTileSizeDefault = computed(
    () => this.videoTileSizePx() === DEFAULT_VIDEO_TILE_SIZE,
  );
  isOpacityDefault = computed(() => this.keypointOpacity() === DEFAULT_OPACITY);
  isSizeDefault = computed(
    () => this.keypointSize() === this.colorService.defaultSize,
  );

  constructor() {
    effect(() =>
      localStorage.setItem(
        'viewer-view-options.video-tile-size',
        String(this.videoTileSizePx()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'viewer-view-options.opacity',
        String(this.keypointOpacity()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'viewer-view-options.size',
        String(this.keypointSize()),
      ),
    );
  }

  resetVideoTileSize() {
    this.videoTileSizePx.set(DEFAULT_VIDEO_TILE_SIZE);
  }

  resetOpacity() {
    this.keypointOpacity.set(DEFAULT_OPACITY);
  }

  resetKeypointSize() {
    this.keypointSize.set(this.colorService.defaultSize);
  }
}
