import { inject, Injectable, signal } from '@angular/core';
import { ProjectInfo } from './project-info';
import { RpcService } from './rpc.service';
import {
  BehaviorSubject,
  catchError,
  distinctUntilChanged,
  first,
  forkJoin,
  map,
  Observable,
  timer,
} from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root',
})
/** Singleton service that loads and caches global and per-project context for the current session. */
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

  private globalLoadedSubject = new BehaviorSubject<GlobalContext | null>(null);
  public globalLoaded$: Observable<GlobalContext | null> =
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

  /** Fetch global and optional per-project context in parallel, updating both BehaviorSubjects. */
  fetchContext(projectKey: string | null): Observable<{
    globalContext: GlobalContext;
    projectContext: ProjectContext | null;
  }> {
    const globalContext$ = this.rpc.callObservable('GetGlobalContext').pipe(
      first(),
      map((response: unknown) => {
        const globalContext = response as GlobalContext;

        this.globalLoadedSubject.next(globalContext);
        window.umami?.identify({
          versions: globalContext.versions,
          isEditable: globalContext.isEditable,
        });
        return globalContext;
      }),
    );

    const projectContext$ = !projectKey
      ? timer(100).pipe(
          first(),
          map(() => {
            const data = null;
            this.projectLoadedSubject.next(data);
            return data;
          }),
        )
      : this.rpc.callObservable('getProjectInfo', { projectKey }).pipe(
          first(),
          map((response: unknown) => {
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

            if (this._projectInfo?.views) {
              this.setAllViews(this._projectInfo.views as string[]);
            }

            const ctx: ProjectContext = {
              key: projectKey,
              projectInfo: this._projectInfo ?? null,
            };
            this.projectLoadedSubject.next(ctx);
            return ctx;
          }),
          catchError((err) => {
            console.error('Failed to fetch project context', err);
            throw err;
          }),
        );

    return forkJoin({
      globalContext: globalContext$,
      projectContext: projectContext$,
    });
  }
  // ---------------------
  // Projects listing API
  // ---------------------
  public projects = signal<ListProjectItem[] | undefined>(undefined);

  /** Fetch the full project list from the backend and update the projects signal. */
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
        stats: p.stats,
      }));
      this.projects.set(items);
    } catch (err) {
      console.error('Failed to fetch projects list', err);
      this.projects.set([]);
    }
  }

  /** Return the currently loaded ProjectInfo (legacy getter; prefer projectContext signal). */
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

  /** Patch a project's project.yaml metadata and refresh the project list. */
  async updateProjectConfig(payload: {
    projectKey: string;
    projectInfo: Partial<ProjectInfo>;
  }): Promise<void> {
    // Strip undefined fields for patch semantics
    const cleaned: Record<string, unknown> = {};
    Object.entries(payload.projectInfo).forEach(([k, v]) => {
      if (v !== undefined) cleaned[k] = v;
    });
    await this.rpc.call('UpdateProjectConfig', {
      projectKey: payload.projectKey,
      projectInfo: cleaned,
    });
    await this.fetchProjects();
  }

  /** Create a new project directory, register it, and refresh the project list. */
  async createNewProject(payload: {
    projectKey: string;
    data_dir: string;
    model_dir?: string | null;
    projectInfo: ProjectInfo | Partial<ProjectInfo>;
  }): Promise<void> {
    const body: any = {
      projectKey: payload.projectKey,
      data_dir: payload.data_dir,
      projectInfo: payload.projectInfo,
    };
    if (payload.model_dir) {
      body.model_dir = payload.model_dir;
    }
    await this.rpc.call('CreateNewProject', body);
    await this.fetchProjects();
  }

  /** Update data_dir/model_dir for a project and refresh the project list. */
  async updateProjectPaths(
    data_dir: string,
    model_dir?: string | null,
    projectKey?: string,
  ) {
    await this.rpc.call('UpdateProjectPaths', {
      projectKey: projectKey ?? this.getProjectKeyOrThrow(),
      data_dir,
      model_dir,
    });
    await this.fetchProjects();
  }

  /** Register an existing project directory and refresh the project list. */
  async registerExistingProject(payload: {
    projectKey: string;
    data_dir: string;
    model_dir?: string | null;
  }): Promise<void> {
    await this.rpc.call('RegisterExistingProject', payload);
    await this.fetchProjects();
  }

  /** Unregister (and optionally delete) a project, then refresh the project list. */
  async deleteProject(projectKey: string, removeFiles: boolean) {
    await this.rpc.call('deleteProject', {
      projectKey,
      removeFiles,
    });
    await this.fetchProjects();
  }

  // Modern model catalogs
  _allViews = new BehaviorSubject<string[]>([]);
  allViews$ = this._allViews.asObservable().pipe(distinctUntilChanged());
  allViews = toSignal(this.allViews$, { requireSync: true });
  /** Push a new set of view names (with 'unknown' appended) into the allViews stream. */
  setAllViews(views: string[]) {
    this._allViews.next(views.concat(['unknown']));
  }

  _allKeypoints = new BehaviorSubject<string[]>([]);
  allKeypoints$ = this._allKeypoints
    .asObservable()
    .pipe(distinctUntilChanged());
  allKeypoints = toSignal(this.allKeypoints$, { requireSync: true });
  /** Push a new set of keypoint names into the allKeypoints stream. */
  setAllKeypoints(keypoints: string[]) {
    this._allKeypoints.next(keypoints);
  }

  _allModels = new BehaviorSubject<string[]>([]);
  allModels$ = this._allModels.asObservable().pipe(distinctUntilChanged());
  allModels = toSignal(this.allModels$, { requireSync: true });
  /** Push a new set of model keys into the allModels stream. */
  setAllModels(models: string[]) {
    this._allModels.next(models);
  }
}
/** App-wide context fetched at startup: upload paths, home dir, and installed package versions. */
export interface GlobalContext {
  uploadDir: string;
  homeDir: string;
  versions: Record<string, string | null>;
  isEditable: Record<string, boolean>;
}
/** Per-project context available to all project-scoped pages after the route resolver runs. */
export interface ProjectContext {
  key: string;
  projectInfo: ProjectInfo | null;
}

/** Frame counts for one label CSV (total and labeled). */
export interface LabelFileStats {
  name: string;
  total_frames: number;
  labeled_frames: number;
}

/** Aggregated project statistics shown on the project list card. */
export interface ProjectStats {
  session_count: number;
  label_file_count: number;
  label_files_stats: LabelFileStats[];
  labeled_frames_count?: number | null;
  keypoint_names: string[];
  view_names: string[];
  model_count: number;
  error?: string;
}

/** One entry in the project list, including paths and optional stats. */
export interface ListProjectItem {
  project_key: string;
  data_dir: string;
  model_dir: string | null;
  stats?: ProjectStats;
}

/** Response from the listProjects RPC. */
export interface ListProjectInfoResponse {
  projects: ListProjectItem[];
}
