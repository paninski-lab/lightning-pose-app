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

  private globalLoadedSubject = new BehaviorSubject<GlobalContext>({
    hello: 'world',
  });
  public globalLoaded$: Observable<GlobalContext> =
    this.globalLoadedSubject.asObservable();

  private projectLoadedSubject = new BehaviorSubject<ProjectContext | null>(
    null,
  );
  public projectLoaded$: Observable<ProjectContext | null> =
    this.projectLoadedSubject.asObservable();

  public globalContext = toSignal(this.globalLoadedSubject.asObservable(), {
    requireSync: true,
  });
  public projectContext = toSignal(this.projectLoadedSubject.asObservable(), {
    requireSync: true,
  });

  fetchContext(projectKey: string | null): void {
    timer(500)
      .pipe(first())
      .subscribe(() => {
        const data: GlobalContext = { hello: 'world' };
        this.globalLoadedSubject.next(data);
      });
    if (!projectKey) {
      // Emits on next tick so the caller of this fn has time to subscribe to
      // observable after calling this fn.
      timer(100)
        .pipe(first())
        .subscribe(() => {
          this.projectLoadedSubject.next(null);
        });
    } else {
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
            this.projectLoadedSubject.next(ctx);
          },
          error: (err) => {
            console.error('Failed to fetch project context', err);
          },
        });
    }
  }
  // ---------------------
  // Projects listing API
  // ---------------------
  public projects = signal<ListProjectItem[] | undefined>(undefined);

  async fetchProjects(): Promise<void> {
    try {
      const resp = (await this.rpc.call(
        'listProjects',
      )) as ListProjectInfoResponse;
      // Normalize paths to strings
      const items: ListProjectItem[] = resp.projects.map((p) => ({
        project_key: p.project_key,
        data_dir: String(p.data_dir),
        model_dir: p.model_dir == null ? null : String(p.model_dir),
      }));
      this.projects.set(items);
    } catch (err) {
      console.error('Failed to fetch projects list', err);
      this.projects.set([]);
    }
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

export interface ListProjectItem {
  project_key: string;
  data_dir: string;
  model_dir: string | null;
}

export interface ListProjectInfoResponse {
  projects: ListProjectItem[];
}
