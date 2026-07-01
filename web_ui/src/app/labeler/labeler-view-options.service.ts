import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ColorService } from '../infra/color.service';
import { debounceTime, merge } from 'rxjs';

const DEFAULT_BRIGHTNESS = 1;
const DEFAULT_CONTRAST = 1;
const UMAMI_DEBOUNCE_TIME_MS = 10000;

@Injectable()
/** Scoped service holding per-session labeler display options, persisted to localStorage. */
export class LabelerViewOptionsService {
  private colorService = inject(ColorService);
  private destroyRef = inject(DestroyRef);
  isShowingTemporalContext = signal(false);
  temporalContextIndex = signal<number | null>(null);

  imgBrightnessScalar = signal(DEFAULT_BRIGHTNESS);
  imgContrastScalar = signal(DEFAULT_CONTRAST);
  keypointOpacity = signal(
    Number(localStorage.getItem('labeler-view-options.opacity')) ||
      this.colorService.defaultOpacity,
  );
  keypointSize = signal(
    Number(localStorage.getItem('labeler-view-options.size')) ||
      this.colorService.defaultSize,
  );
  keypointLabelFontSize = signal(
    Number(localStorage.getItem('labeler-view-options.labelFontSize')) || 8,
  );
  isBrightnessDefault = computed(
    () => this.imgBrightnessScalar() === DEFAULT_BRIGHTNESS,
  );
  isContrastDefault = computed(
    () => this.imgContrastScalar() === DEFAULT_CONTRAST,
  );
  isOpacityDefault = computed(
    () => this.keypointOpacity() === this.colorService.defaultOpacity,
  );
  isSizeDefault = computed(
    () => this.keypointSize() === this.colorService.defaultSize,
  );
  isLabelFontSizeDefault = computed(() => this.keypointLabelFontSize() === 8);
  enableKeypointLabels = signal(true);

  imgCssFilterString = computed(() => {
    return `brightness(${this.imgBrightnessScalar()}) contrast(${this.imgContrastScalar()})`;
  });
  enablePixelGrid = signal(false);

  constructor() {
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.opacity',
        String(this.keypointOpacity()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.size',
        String(this.keypointSize()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.labelFontSize',
        String(this.keypointLabelFontSize()),
      ),
    );

    merge(
      toObservable(this.imgBrightnessScalar),
      toObservable(this.imgContrastScalar),
      toObservable(this.keypointOpacity),
      toObservable(this.keypointSize),
      toObservable(this.keypointLabelFontSize),
      toObservable(this.enableKeypointLabels),
      toObservable(this.enablePixelGrid),
    )
      .pipe(
        debounceTime(UMAMI_DEBOUNCE_TIME_MS),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        window.umami?.track('labeler_view_options_change', {
          imgBrightnessScalar: this.imgBrightnessScalar(),
          imgContrastScalar: this.imgContrastScalar(),
          keypointOpacity: this.keypointOpacity(),
          keypointSize: this.keypointSize(),
          keypointLabelFontSize: this.keypointLabelFontSize(),
          enableKeypointLabels: this.enableKeypointLabels(),
          enablePixelGrid: this.enablePixelGrid(),
        });
      });

    this.destroyRef.onDestroy(() => {
      this.temporalContextAbortController?.abort();
    });
  }

  /** Reset keypoint size to the ColorService default. */
  resetKeypointSize() {
    this.keypointSize.set(this.colorService.defaultSize);
  }

  /** Reset keypoint label font size to 8px. */
  resetLabelFontSize() {
    this.keypointLabelFontSize.set(8);
  }

  /** Reset image brightness to 1 (no adjustment). */
  resetBrightness() {
    this.imgBrightnessScalar.set(DEFAULT_BRIGHTNESS);
  }

  /** Reset image contrast to 1 (no adjustment). */
  resetContrast() {
    this.imgContrastScalar.set(DEFAULT_CONTRAST);
  }

  /** Reset keypoint opacity to the ColorService default. */
  resetOpacity() {
    this.keypointOpacity.set(this.colorService.defaultOpacity);
  }

  private temporalContextAbortController: AbortController | undefined;
  /** Start the temporal context animation loop, cycling through nearby frames. */
  handleShowTemporalContextClick() {
    this.temporalContextAbortController = new AbortController();

    this.isShowingTemporalContext.set(true);
    this.beginTemporalContextLoop(this.temporalContextAbortController.signal);
  }

  /** Abort the temporal context animation loop and reset the visible index. */
  handleStopTemporalContextClick() {
    this.temporalContextAbortController?.abort();
    this.isShowingTemporalContext.set(false);
  }

  private beginTemporalContextLoop(abortSignal: AbortSignal) {
    let direction = 1;
    const loop = async () => {
      while (!abortSignal.aborted) {
        this.temporalContextIndex.update((index) => {
          const currentIndex = index ?? -1;
          let nextIndex = currentIndex + direction;

          if (nextIndex > 4) {
            direction = -1;
            nextIndex = 3;
          } else if (nextIndex <= 0) {
            direction = 1;
            nextIndex = 0;
          }

          return nextIndex;
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    };
    loop();
  }
}
