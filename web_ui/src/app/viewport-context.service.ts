import { computed, Injectable, signal } from '@angular/core';

@Injectable()
/** Scoped service tracking the current pan/zoom transform for the labeler image viewport. */
export class ViewportContextService {
  readonly scale = signal(1);
  readonly translateX = signal(0);
  readonly translateY = signal(0);

  readonly transform = computed(
    () =>
      `translate3d(${this.translateX()}px, ${this.translateY()}px, 0px) scale(${this.scale()})`,
  );

  /** Set the current zoom scale. */
  setScale(value: number): void {
    this.scale.set(value);
  }

  /** Set the current pan offset in pixels. */
  setTranslate(x: number, y: number): void {
    this.translateX.set(x);
    this.translateY.set(y);
  }
}
