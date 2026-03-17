import {
  Injectable,
  signal,
  computed,
  inject,
  effect,
  DestroyRef,
} from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ColorService } from '../infra/color.service';
import { debounceTime, merge } from 'rxjs';

const DEFAULT_BRIGHTNESS = 1;
const DEFAULT_CONTRAST = 1;
const UMAMI_DEBOUNCE_TIME_MS = 30000;

@Injectable()
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

    merge(
      toObservable(this.imgBrightnessScalar),
      toObservable(this.imgContrastScalar),
      toObservable(this.keypointOpacity),
      toObservable(this.keypointSize),
      toObservable(this.enableKeypointLabels),
      toObservable(this.enablePixelGrid),
    )
      .pipe(
        debounceTime(UMAMI_DEBOUNCE_TIME_MS),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        window.umami?.track('labeler_view_options_change', {
          isShowingTemporalContext: this.isShowingTemporalContext(),
          temporalContextIndex: this.temporalContextIndex(),
          imgBrightnessScalar: this.imgBrightnessScalar(),
          imgContrastScalar: this.imgContrastScalar(),
          keypointOpacity: this.keypointOpacity(),
          keypointSize: this.keypointSize(),
          enableKeypointLabels: this.enableKeypointLabels(),
          enablePixelGrid: this.enablePixelGrid(),
        });
      });

    this.destroyRef.onDestroy(() => {
      this.temporalContextAbortController?.abort();
    });
  }

  resetKeypointSize() {
    this.keypointSize.set(this.colorService.defaultSize);
  }

  resetBrightness() {
    this.imgBrightnessScalar.set(DEFAULT_BRIGHTNESS);
  }

  resetContrast() {
    this.imgContrastScalar.set(DEFAULT_CONTRAST);
  }

  resetOpacity() {
    this.keypointOpacity.set(this.colorService.defaultOpacity);
  }

  private temporalContextAbortController: AbortController | undefined;
  handleShowTemporalContextClick() {
    this.temporalContextAbortController = new AbortController();

    this.isShowingTemporalContext.set(true);
    this.beginTemporalContextLoop(this.temporalContextAbortController.signal);
  }

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
