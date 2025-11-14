import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { ProjectInfo } from './project-info';
import { RpcService } from './rpc.service';
import {
  BehaviorSubject,
  distinctUntilChanged,
  first,
  Observable,
  Subject,
  timer,
} from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root',
})
export class ProjectInfoService {
  rpc = inject(RpcService);

  // undefined means not yet requested
  // null means requested and not present
  private _projectInfo: ProjectInfo | undefined | null = undefined;

  // The directory that we are storing fine videos in.
  fineVideoDir = '';

  // ---------------------
  // Resolver handshake API
  // ---------------------
  public globalContext: WritableSignal<GlobalContext | undefined> =
    signal(undefined);
  public projectContext: WritableSignal<ProjectContext | undefined> =
    signal(undefined);

  private globalLoadedSubject = new Subject<GlobalContext>();
  public globalLoaded$: Observable<GlobalContext> =
    this.globalLoadedSubject.asObservable();

  private projectLoadedSubject = new Subject<ProjectContext>();
  public projectLoaded$: Observable<ProjectContext> =
    this.projectLoadedSubject.asObservable();

  fetchGlobalContext(): void {
    if (this.globalContext()) {
      this.globalLoadedSubject.next(this.globalContext() as GlobalContext);
      return;
    }
    timer(500)
      .pipe(first())
      .subscribe(() => {
        const data: GlobalContext = { hello: 'world' };
        this.globalContext.set(data);
        this.globalLoadedSubject.next(data);
      });
  }

  fetchProjectContext(projectKey: string): void {
    if (!projectKey) return;
    const existing = this.projectContext();
    if (existing && existing.key === projectKey) {
      this.projectLoadedSubject.next(existing);
      return;
    }
    this.rpc
      .callObservable('getProjectInfo', { projectKey })
      .pipe(first())
      .subscribe({
        next: (response: unknown) => {
          // Expecting: { projectInfo: { data_dir, model_dir, views, keypoint_names } }
          const body = response as {
            projectInfo?: Partial<ProjectInfo> | null;
          };
          if (body && body.projectInfo) {
            this._projectInfo = new ProjectInfo(
              body.projectInfo as Partial<ProjectInfo>,
            );
          } else {
            throw Error('Invalid project info response');
          }

          // Update helper catalogs/signals from the loaded project info
          if (this._projectInfo?.views) {
            this.setAllViews(this._projectInfo.views as string[]);
          }

          const ctx: ProjectContext = {
            key: projectKey,
            projectInfo: this._projectInfo ?? null,
          };
          this.projectContext.set(ctx);
          this.projectLoadedSubject.next(ctx);
        },
        error: (err) => {
          console.error('Failed to fetch project context', err);
        },
      });
  }

  // Legacy getter retained for settings component
  get projectInfo(): ProjectInfo {
    return this._projectInfo as ProjectInfo;
  }

  private getProjectKeyOrThrow(): string {
    const ctx = this.projectContext();
    if (!ctx?.key) {
      throw new Error('Project key is not available in project context');
    }
    return ctx.key;
  }

  async setProjectInfo(projectInfo: Partial<ProjectInfo>) {
    const projectKey = this.getProjectKeyOrThrow();
    await this.rpc.call('setProjectInfo', { projectKey, projectInfo });
  }

  // Modern model catalogs
  _allViews = new BehaviorSubject<string[]>([]);
  allViews$ = this._allViews.asObservable().pipe(distinctUntilChanged());
  allViews = toSignal(this.allViews$, { requireSync: true });
  setAllViews(views: string[]) {
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

export interface GlobalContext {
  hello: string;
}

export interface ProjectContext {
  key: string;
  projectInfo: ProjectInfo | null;
}
