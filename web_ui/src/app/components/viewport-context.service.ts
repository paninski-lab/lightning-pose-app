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

  updateScale(mutator: (prev: number) => number): void {
    this.scale.update(mutator);
  }

  setTranslate(x: number, y: number): void {
    this.translateX.set(x);
    this.translateY.set(y);
  }

  updateTranslate(
    updateFn: (prev: { x: number; y: number }) => {
      x: number;
      y: number;
    },
  ): void {
    const next = updateFn({ x: this.translateX(), y: this.translateY() });
    this.translateX.set(next.x);
    this.translateY.set(next.y);
  }
}
