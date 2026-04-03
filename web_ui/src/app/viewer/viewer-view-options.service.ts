import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ColorService } from '../infra/color.service';
import { debounceTime, merge } from 'rxjs';

const DEFAULT_VIDEO_TILE_SIZE = 250;
const DEFAULT_OPACITY = 1.0;
const DEFAULT_LIKELIHOOD_THRESHOLD = 0.9;
const UMAMI_DEBOUNCE_TIME_MS = 10000;

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
  likelihoodThreshold = signal<number>(DEFAULT_LIKELIHOOD_THRESHOLD);
  enableKeypointLabels = signal(false);

  isVideoTileSizeDefault = computed(
    () => this.videoTileSizePx() === DEFAULT_VIDEO_TILE_SIZE,
  );
  isOpacityDefault = computed(() => this.keypointOpacity() === DEFAULT_OPACITY);
  isSizeDefault = computed(
    () => this.keypointSize() === this.colorService.defaultSize,
  );
  isLikelihoodThresholdDefault = computed(
    () => this.likelihoodThreshold() === DEFAULT_LIKELIHOOD_THRESHOLD,
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
      toObservable(this.likelihoodThreshold),
      toObservable(this.enableKeypointLabels),
    )
      .pipe(debounceTime(UMAMI_DEBOUNCE_TIME_MS), takeUntilDestroyed())
      .subscribe(() => {
        window.umami?.track('viewer_view_options_change', {
          videoTileSizePx: this.videoTileSizePx(),
          keypointOpacity: this.keypointOpacity(),
          keypointSize: this.keypointSize(),
          likelihoodThreshold: this.likelihoodThreshold(),
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

  resetLikelihoodThreshold() {
    this.likelihoodThreshold.set(DEFAULT_LIKELIHOOD_THRESHOLD);
  }
}
