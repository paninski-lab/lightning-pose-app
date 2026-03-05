import { Injectable, signal, computed, OnDestroy, inject } from '@angular/core';
import { ColorService } from '../infra/color.service';

@Injectable()
export class LabelerViewOptionsService implements OnDestroy {
  isShowingTemporalContext = signal(false);
  temporalContextIndex = signal<number | null>(null);

  imgBrightnessScalar = signal(1);
  imgContrastScalar = signal(1);
  keypointOpacity = signal(0.15);
  keypointSize = signal(5);
  imgCssFilterString = computed(() => {
    return `brightness(${this.imgBrightnessScalar()}) contrast(${this.imgContrastScalar()})`;
  });
  enablePixelGrid = signal(false);
  private colorService = inject(ColorService);

  constructor() {
    // sets the default
    this.resetKeypointSize();
  }

  resetKeypointSize() {
    this.keypointSize.set(this.colorService.defaultSize);
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

  ngOnDestroy() {
    this.temporalContextAbortController?.abort();
  }
}
