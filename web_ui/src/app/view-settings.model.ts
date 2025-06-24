import { Injectable } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
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
}
