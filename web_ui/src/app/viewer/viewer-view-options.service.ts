import { inject, Injectable, signal, computed, effect } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ColorService } from '../infra/color.service';
import { debounceTime, merge } from 'rxjs';

const DEFAULT_VIDEO_TILE_SIZE = 250;
const DEFAULT_OPACITY = 1.0;
const UMAMI_DEBOUNCE_TIME_MS = 30000;

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

    merge(
      toObservable(this.videoTileSizePx),
      toObservable(this.keypointOpacity),
      toObservable(this.keypointSize),
      toObservable(this.enableKeypointLabels),
    )
      .pipe(debounceTime(UMAMI_DEBOUNCE_TIME_MS), takeUntilDestroyed())
      .subscribe(() => {
        window.umami?.track('viewer_view_options_change', {
          videoTileSizePx: this.videoTileSizePx(),
          keypointOpacity: this.keypointOpacity(),
          keypointSize: this.keypointSize(),
          enableKeypointLabels: this.enableKeypointLabels(),
        });
      });
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
