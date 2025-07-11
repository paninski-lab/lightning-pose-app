import { Injectable } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { compareStringArraysOrdered } from './utils/comparators';

@Injectable()
export class ViewSettings {
  _viewsShown = new BehaviorSubject<string[]>([]);
  viewsShown$ = this._viewsShown
    .asObservable()
    .pipe(distinctUntilChanged(compareStringArraysOrdered));
  viewsShown = toSignal(this.viewsShown$, { requireSync: true });
  setViewsShown(selected: string[]) {
    this._viewsShown.next(selected);
  }

  _keypointsShown = new BehaviorSubject<string[]>([]);
  keypointsShown$ = this._keypointsShown
    .asObservable()
    .pipe(distinctUntilChanged(compareStringArraysOrdered));
  keypointsShown = toSignal(this.keypointsShown$, { requireSync: true });
  setKeypointsShown(selected: string[]) {
    this._keypointsShown.next(selected);
  }

  _modelsShown = new BehaviorSubject<string[]>([]);
  modelsShown$ = this._modelsShown
    .asObservable()
    .pipe(distinctUntilChanged(compareStringArraysOrdered));
  modelsShown = toSignal(this.modelsShown$, { requireSync: true });
  setModelsShown(selected: string[]) {
    this._modelsShown.next(selected);
  }

  _modelOptions = new BehaviorSubject<string[]>([]);
  modelOptions$ = this._modelOptions
    .asObservable()
    .pipe(distinctUntilChanged(compareStringArraysOrdered));
  modelOptions = toSignal(this.modelOptions$, { requireSync: true });
  setModelOptions(selected: string[]) {
    this._modelOptions.next(selected);
  }

  constructor() {
    // When model options change, some modelsShown may become invalid. Remove those.
    this.modelOptions$
      .pipe(takeUntilDestroyed())
      .subscribe((newOptions: string[]) => {
        this._modelsShown.next(
          this._modelsShown.value.filter((model) => newOptions.includes(model)),
        );
      });
  }
}
