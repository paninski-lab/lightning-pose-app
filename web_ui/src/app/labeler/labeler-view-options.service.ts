import { Injectable, signal, computed, OnDestroy } from '@angular/core';

@Injectable()
export class LabelerViewOptionsService implements OnDestroy {
  isShowingTemporalContext = signal<boolean>(false);
  temporalContextIndex = signal<number | null>(null);

  imgBrightnessScalar = signal<number>(1);
  imgContrastScalar = signal<number>(1);
  imgCssFilterString = computed(() => {
    return `brightness(${this.imgBrightnessScalar()}) contrast(${this.imgContrastScalar()})`;
  });

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
