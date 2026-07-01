import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ColorService } from '../infra/color.service';
import { debounceTime, merge } from 'rxjs';

const DEFAULT_VIDEO_TILE_SIZE = 250;
const DEFAULT_OPACITY = 1.0;
const DEFAULT_LIKELIHOOD_THRESHOLD = 0.9;
const UMAMI_DEBOUNCE_TIME_MS = 10000;

@Injectable()
/** Scoped service holding per-session viewer display options, persisted to localStorage. */
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
  keypointLabelFontSize = signal<number>(
    Number(localStorage.getItem('viewer-view-options.labelFontSize')) || 8,
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
  isLabelFontSizeDefault = computed(() => this.keypointLabelFontSize() === 8);
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
    effect(() =>
      localStorage.setItem(
        'viewer-view-options.labelFontSize',
        String(this.keypointLabelFontSize()),
      ),
    );

    merge(
      toObservable(this.videoTileSizePx),
      toObservable(this.keypointOpacity),
      toObservable(this.keypointSize),
      toObservable(this.keypointLabelFontSize),
      toObservable(this.likelihoodThreshold),
      toObservable(this.enableKeypointLabels),
    )
      .pipe(debounceTime(UMAMI_DEBOUNCE_TIME_MS), takeUntilDestroyed())
      .subscribe(() => {
        window.umami?.track('viewer_view_options_change', {
          videoTileSizePx: this.videoTileSizePx(),
          keypointOpacity: this.keypointOpacity(),
          keypointSize: this.keypointSize(),
          keypointLabelFontSize: this.keypointLabelFontSize(),
          likelihoodThreshold: this.likelihoodThreshold(),
          enableKeypointLabels: this.enableKeypointLabels(),
        });
      });
  }

  /** Reset video tile size to 250px. */
  resetVideoTileSize() {
    this.videoTileSizePx.set(DEFAULT_VIDEO_TILE_SIZE);
  }

  /** Reset keypoint opacity to 1.0 (fully opaque). */
  resetOpacity() {
    this.keypointOpacity.set(DEFAULT_OPACITY);
  }

  /** Reset keypoint size to the ColorService default. */
  resetKeypointSize() {
    this.keypointSize.set(this.colorService.defaultSize);
  }

  /** Reset keypoint label font size to 8px. */
  resetLabelFontSize() {
    this.keypointLabelFontSize.set(8);
  }

  /** Reset likelihood threshold to 0.9. */
  resetLikelihoodThreshold() {
    this.likelihoodThreshold.set(DEFAULT_LIKELIHOOD_THRESHOLD);
  }
}
