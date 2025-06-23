import { inject, Injectable } from '@angular/core';
import { ProjectInfo } from './project-info';
import { RpcService } from './rpc.service';
import { BehaviorSubject, distinctUntilChanged } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root',
})
export class ProjectInfoService {
  rpc = inject(RpcService);

  // undefined means not yet requested
  // null means requested and not present
  private _projectInfo: ProjectInfo | undefined | null = undefined;

  async loadProjectInfo() {
    /** Returns null if ProjectInfo wasn't initialized yet.
     * In this case the app should prompt the user for some project info. */
    const response = await this.rpc.call('getProjectInfo');
    this._projectInfo = response.projectInfo
      ? new ProjectInfo(response.projectInfo)
      : null; // ProjectInfo | null

    this.setAllViews(this._projectInfo?.views ?? []);
  }

  get projectInfo(): ProjectInfo {
    return this._projectInfo as ProjectInfo;
  }

  async setProjectInfo(projectInfo: Partial<ProjectInfo>) {
    /** Saves changes to the project info.  */
    await this.rpc.call('setProjectInfo', { projectInfo });
    window.location.reload();
  }

  // Newer style of models.

  _allViews = new BehaviorSubject<string[]>([]);
  allViews$ = this._allViews.asObservable().pipe(distinctUntilChanged());
  allViews = toSignal(this.allViews$, { requireSync: true });
  setAllViews(views: string[]) {
    // hack: concat unknown to fix other logic that iterates over all views
    // instead that logic should iterate over the current session's views.
    this._allViews.next(views.concat(['unknown']));
  }

  _allKeypoints = new BehaviorSubject<string[]>([]);
  allKeypoints$ = this._allKeypoints
    .asObservable()
    .pipe(distinctUntilChanged());
  allKeypoints = toSignal(this.allKeypoints$, { requireSync: true });
  setAllKeypoints(keypoints: string[]) {
    this._allKeypoints.next(keypoints);
  }

  _allModels = new BehaviorSubject<string[]>([]);
  allModels$ = this._allModels.asObservable().pipe(distinctUntilChanged());
  allModels = toSignal(this.allModels$, { requireSync: true });
  setAllModels(models: string[]) {
    this._allModels.next(models);
  }
}
