import { Injectable, computed, signal } from '@angular/core';

@Injectable()
export class ViewportContextService {
  readonly scale = signal(1);
  readonly translateX = signal(0);
  readonly translateY = signal(0);

  readonly transform = computed(
    () =>
      `translate3d(${this.translateX()}px, ${this.translateY()}px, 0px) scale(${this.scale()})`,
  );

  setScale(value: number): void {
    this.scale.set(value);
  }

  setTranslate(x: number, y: number): void {
    this.translateX.set(x);
    this.translateY.set(y);
  }
}
