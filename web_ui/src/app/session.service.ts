import { inject, Injectable, signal } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  firstValueFrom,
  Observable,
  of,
} from 'rxjs';
import { Session } from './session.model';
import { RpcService } from './rpc.service';
import { ProjectInfoService } from './project-info.service';
import { PredictionFile } from './prediction-file';
import { HttpClient } from '@angular/common/http';
import { CsvParserService } from './csv-parser.service';
import { FFProbeInfo } from './ffprobe-info';
import { toSignal } from '@angular/core/rxjs-interop';
import { createSessionViewComparator } from './utils/comparators';
import { MVLabelFile } from './label-file.model';
import { fv, mvf, MVFrame } from './labeler/frame.model';
import { SaveFrameView, SaveMvFrame } from './labeler/save-mvframe';
import {
  GetMVAutoLabelsRequest,
  GetMVAutoLabelsResponse,
} from './labeler/mv-autolabel';
import _ from 'lodash';
import { ModelListResponse } from './modelconf';

type SessionModelMap = Record<string, string[]>;

interface RGlobResponse {
  entries: { path: string; type?: 'dir' | 'file' }[];
  relativeTo: string;
}

@Injectable({
  providedIn: 'root',
})
/** Manages sessions, label files, prediction files, and all model/inference operations for the current project. */
export class SessionService {
  private rpc = inject(RpcService);
  private httpClient = inject(HttpClient);

  private predictionFiles = [] as PredictionFile[];
  private projectInfoService = inject(ProjectInfoService);
  private csvParser = inject(CsvParserService);

  sessionsLoading = signal(true);
  private _allSessions = new BehaviorSubject<Session[]>([]);
  allSessions$ = this._allSessions.asObservable();
  allSessions = toSignal(this.allSessions$, { requireSync: true });

  private sessionModelMap = {} as SessionModelMap;

  /**
   * Upload a single video file to the server.
   * Uses multipart/form-data and reports progress events.
   */
  uploadVideo(
    file: File,
    filename: string,
    shouldOverwrite = false,
  ): Observable<import('@angular/common/http').HttpEvent<unknown>> {
    const form = new FormData();
    form.append('projectKey', this.getProjectKeyOrThrow());
    form.append('filename', filename);
    form.append('should_overwrite', String(shouldOverwrite));
    form.append('file', file, filename);

    return this.httpClient.post('/app/v0/rpc/UploadVideo', form, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /**
   * Start or attach to a transcode and stream progress via SSE.
   * inputPath must be either an absolute filesystem path or an ``uploads://`` URI.
   * Completes when server reports DONE or ERROR.
   */
  transcodeVideoSse(
    inputPath: string,
    shouldOverwrite = false,
  ): Observable<VideoTaskStatus> {
    const projectKey = this.getProjectKeyOrThrow();
    const params = new URLSearchParams({
      projectKey,
      inputPath,
      should_overwrite: String(shouldOverwrite),
    });
    const url = `/app/v0/sse/TranscodeVideo?${params.toString()}`;

    return new Observable<VideoTaskStatus>((subscriber) => {
      const es = new EventSource(url);
      const onMessage = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as VideoTaskStatus;
          subscriber.next(data);
          if (
            data.transcodeStatus === 'DONE' ||
            data.transcodeStatus === 'ERROR'
          ) {
            es.close();
            subscriber.complete();
          }
        } catch {
          // Ignore malformed events
        }
      };
      const onError = () => {
        // Network/SSE error – close and error out
        try {
          es.close();
        } catch { /* ignore */ }
        subscriber.error(new Error('Transcode stream error'));
      };
      es.onmessage = onMessage;
      es.onerror = onError;
      return () => {
        try {
          es.close();
        } catch { /* ignore */ }
      };
    });
  }

  /**
   * TEMP: Check if a file already exists in the server uploads dir by name.
   * Uses the existing rglob RPC. The uploads directory path is obtained from
   * global context (RootConfig.uploadDir) provided by the backend.
   */
  async existsInUploads(filename: string): Promise<boolean> {
    try {
      const uploadDir = await this.getUploadDir();
      const response = (await this.rpc.call('rglob', {
        baseDir: uploadDir,
        pattern: filename,
        noDirs: true,
      })) as RGlobResponse;
      return response.entries.some((e) => this._basename(e.path) === filename);
    } catch {
      // On error, assume it does not exist to allow uploads to proceed
      return false;
    }
  }

  private async getUploadDir(): Promise<string> {
    const ctx = this.projectInfoService.globalContext();
    if (ctx?.uploadDir && ctx.uploadDir.length > 0) {
      return ctx.uploadDir;
    }
    throw new Error('uploadDir not in context');
  }

  private _basename(p: string): string {
    const idx1 = p.lastIndexOf('/');
    const idx2 = p.lastIndexOf('\\');
    const idx = Math.max(idx1, idx2);
    return idx >= 0 ? p.substring(idx + 1) : p;
  }

  private getProjectKeyOrThrow(): string {
    const ctx = this.projectInfoService.projectContext();
    if (!ctx?.key) throw new Error('Project key missing from project context');
    return ctx.key;
  }

  /** Fetch and parse all session video files, updating the allSessions signal. */
  async loadSessions() {
    try {
      this.sessionsLoading.set(true);
      const sessions = await this._loadSessions();
      this.sessionsLoading.set(false);
      this._allSessions.next(sessions);
    } catch {
      this.sessionsLoading.set(false);
    }
  }
  /** Internal: fetch MP4 paths via rglob and group them into Session objects. */
  async _loadSessions() {
    const projectInfo = this.projectInfoService.projectInfo;

    const response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.data_dir,
      pattern: 'videos*/**/*.mp4',
      noDirs: true,
    })) as RGlobResponse;

    const mp4Files: string[] = response.entries.map((entry) => entry.path);
    const sessions: Session[] = this.groupFilesBySession(
      mp4Files,
      this.projectInfoService.projectInfo.views,
    );

    return sessions;
  }

  private groupFilesBySession(filenames: string[], views: string[]): Session[] {
    const pathKeyToItsViewFiles = this.groupFilesByView(filenames, views);
    // Convert the Map to the required Session array format
    const cmp = createSessionViewComparator(this.projectInfoService.allViews());
    return Array.from(pathKeyToItsViewFiles.entries()).map(
      ([relativePath, groupedFiles]) => {
        const sessionViews = groupedFiles.map(({ view, filename }) => ({
          viewName: view,
          videoPath:
            this.projectInfoService.projectInfo.data_dir + '/' + filename,
        }));
        // The filename is the key.
        const key = relativePath
          .split('/')
          .at(-1)!
          .replace(/\.(mp4|avi)$/, '');
        return {
          key: key,
          relativePath,
          views: [...sessionViews].sort(cmp),
        };
      },
    );
  }

  private groupFilesByView(
    paths: string[],
    views: string[],
  ): Map<string, { view: string; filename: string }[]> {
    // Use a Map to group files by their session key
    const pathKeyToItsFiles = new Map<
      string,
      { view: string; filename: string }[]
    >();

    for (const path of paths) {
      const parts = path.split('/');
      const filename = parts.at(-1)!;
      let viewName = views.find((v) => filename.includes(v));
      if (!viewName) {
        viewName = 'unknown';
      }

      // Remove the view name to get the base session key
      const pathKey =
        viewName == 'unknown'
          ? path
          : [...parts.slice(0, -1), filename.replace(viewName, '*')].join('/');

      if (!pathKeyToItsFiles.has(pathKey)) {
        pathKeyToItsFiles.set(pathKey, []);
      }
      pathKeyToItsFiles.get(pathKey)!.push({
        view: viewName,
        filename: path,
      });
    }
    return pathKeyToItsFiles;
  }

  labelFilesLoading = signal(false);
  private _allLabelFiles = new BehaviorSubject<MVLabelFile[]>([]);
  allLabelFiles$ = this._allLabelFiles.asObservable();
  allLabelFiles = toSignal(this.allLabelFiles$, { requireSync: true });

  /** Fetch valid label CSV files and update the allLabelFiles signal. */
  async loadLabelFiles() {
    try {
      this.labelFilesLoading.set(true);
      await this._loadLabelFiles();
    } finally {
      this.labelFilesLoading.set(false);
    }
  }
  /** Internal: fetch CSV paths via findLabelFiles RPC and group them into MVLabelFile objects. */
  async _loadLabelFiles() {
    const response = (await this.rpc.call('findLabelFiles', {
      projectKey: this.getProjectKeyOrThrow(),
    })) as {
      labelFiles: string[];
    };

    const csvFiles: string[] = response.labelFiles;
    const cmp = createSessionViewComparator(this.projectInfoService.allViews());

    const files: MVLabelFile[] = Array.from(
      this.groupFilesByView(
        csvFiles,
        this.projectInfoService.projectInfo.views,
      ).entries(),
    ).map(([key, groupedFiles]) => {
      const labelFileViews = groupedFiles.map(({ view, filename }) => ({
        viewName: view,
        csvPath: this.projectInfoService.projectInfo.data_dir + '/' + filename,
      }));
      return {
        key,
        views: [...labelFileViews].sort(cmp),
      };
    });

    return this._allLabelFiles.next(files);
  }
  /** Return the key of the default CollectedData label file, or null if none exists. */
  getDefaultLabelFile(): string | null {
    const allFiles = this.allLabelFiles();
    // Try to find "CollectedData_*.csv" or "CollectedData.csv"
    const defaultFile = allFiles.find(
      (f) => f.key === 'CollectedData_*.csv' || f.key === 'CollectedData.csv',
    );

    return defaultFile?.key ?? null;
  }

  /** Scan model_dir for prediction CSVs and initialize the model, keypoint, and session-model state. */
  async loadPredictionIndex() {
    /* Finds all prediction files in model directory to update
    application's state: available prediction files and their metadata. */
    const projectInfo = this.projectInfoService.projectInfo;
    // Search for all CSV files.
    const response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.model_dir,
      pattern: '**/video_preds/**/*.csv',
      noDirs: true,
    })) as RGlobResponse;

    // Filter out special CSV files.
    this.predictionFiles = response.entries
      .filter((entry) => {
        if (entry.path.endsWith('bbox.csv')) return false;
        if (entry.path.endsWith('predictions.csv')) return false;
        if (entry.path.endsWith('_error.csv')) return false;
        if (entry.path.endsWith('_loss.csv')) return false;
        if (entry.path.endsWith('_norm.csv')) return false;

        return true;
      })
      // Filter out CSV files that don't look like prediction files.
      .map((entry) => {
        let match = entry.path.match(
          /(.+)\/video_preds\/([^/]+)\.mp4\/predictions\.csv/,
        );
        if (!match) {
          match = entry.path.match(/(.+)\/video_preds\/([^/]+)\.csv/);
        }
        if (!match) return null;
        // modelKey is everything before video_preds
        const modelKey = match[1];
        const sessionView = match[2];

        let sessionKey: string;
        let viewName = this.projectInfoService
          .allViews()
          .find((v) => sessionView.includes(v));
        if (!viewName) {
          sessionKey = sessionView;
          viewName = 'unknown';
        } else {
          sessionKey = sessionView.replace(viewName, '*');
        }

        // Parse out key metadata.
        return {
          path: entry.path,
          modelKey,
          sessionKey,
          viewName,
        };
      })
      .filter((entry) => entry != null);

    // Update application state.
    this.initModels();

    // TODO: Find a better place for this call.
    await this.initKeypoints();
  }

  private initModels() {
    this.sessionModelMap = this.predictionFiles.reduce(
      (sessionModelMap: SessionModelMap, entry: PredictionFile) => {
        const { sessionKey, modelKey } = entry;
        // If the sessionKey doesn't exist yet, initialize it with an empty array
        if (!sessionModelMap[sessionKey]) {
          sessionModelMap[sessionKey] = [];
        }
        // Add the current modelKey to the list for this sessionKey
        sessionModelMap[sessionKey].push(modelKey);
        return sessionModelMap;
      },
      {},
    ); // Initialize the sessionModelMap as an empty Record

    const uniqueModels = new Set(
      this.predictionFiles
        .map((pfile) => pfile.modelKey)
        .filter((x) => x) as string[],
    );
    this.projectInfoService.setAllModels(Array.from(uniqueModels).sort());
  }

  private async initKeypoints() {
    /** Gets the list of keypoints from the first CSV file */
    if (this.predictionFiles.length === 0) return;

    const csvFile = await this.getPredictionFile(this.predictionFiles[0]);
    if (!csvFile) return;
    const allKeypoints = this.csvParser.getBodyParts(csvFile);
    this.projectInfoService.setAllKeypoints(allKeypoints);
  }

  /** Return all prediction files that belong to the given session key. */
  getPredictionFilesForSession(sessionKey: string): PredictionFile[] {
    const predictionFiles = this.predictionFiles.filter(
      (p) => p.sessionKey === sessionKey,
    );
    return predictionFiles;
  }

  /** Fetch the raw CSV text for a prediction file, returning null if it does not exist. */
  async getPredictionFile(pfile: PredictionFile): Promise<string | null> {
    const modelDir = this.projectInfoService.projectInfo?.model_dir as string;
    // returns null if the prediction file did not exist.

    const src = '/app/v0/files/' + modelDir + '/' + pfile.path;
    return await firstValueFrom(
      this.httpClient.get(src, { responseType: 'text' }).pipe(
        catchError((error) => {
          if (error.status === 404) {
            return [null]; // Return null when a 404 error occurs
          }
          throw error; // Re-throw other errors
        }),
      ),
    );
  }

  /** Run ffprobe on a project-scoped video file and return its metadata. */
  async ffprobe(file: string): Promise<FFProbeInfo> {
    const response = (await this.rpc.call('ffprobe', {
      projectKey: this.getProjectKeyOrThrow(),
      path: file,
    })) as FFProbeInfo;

    return response;
  }

  /** Fetch and parse a YAML config file by absolute path, returning null if not found (404). */
  async getYamlFile(filePath: string): Promise<any | null> {
    // GET /app/v0/getYamlFile?file_path=...
    const url = `/app/v0/getYamlFile`;
    return await firstValueFrom(
      this.httpClient
        .get(url, {
          params: {
            file_path: filePath,
            projectKey: this.getProjectKeyOrThrow(),
          },
        })
        .pipe(
          catchError((error) => {
            if (error.status === 404) {
              return of(null);
            }
            throw error;
          }),
        ),
    );
  }

  /** Fetch the bundled default single-view training config YAML. */
  async getDefaultYamlFile(): Promise<Record<string, unknown>> {
    return firstValueFrom(
      this.httpClient.get<Record<string, unknown>>('/app/v0/configs/default'),
    );
  }

  /** Fetch the bundled default multiview training config YAML. */
  async getDefaultMultiviewYamlFile(): Promise<Record<string, unknown>> {
    return firstValueFrom(
      this.httpClient.get<Record<string, unknown>>(
        '/app/v0/configs/default_multiview',
      ),
    );
  }

  /** Return model keys that have predictions for the given session key. */
  getAvailableModelsForSession(sessionKey: string): string[] {
    return this.sessionModelMap[sessionKey] || [];
  }

  /** Glob baseDir for video files and return grouped sessions plus ungrouped dirs and videos. */
  async getSessions(
    baseDir: string,
  ): Promise<{
    sessions: Session[];
    ungroupedDirs: string[];
    ungroupedVideos: string[];
  }> {
    const response = (await this.rpc.call('rglob', {
      baseDir,
      pattern: '*',
      stat: true,
    })) as RGlobResponse;

    const ungroupedDirs: string[] = [];
    const videoPaths: string[] = [];

    for (const entry of response.entries) {
      if (entry.type === 'dir') {
        ungroupedDirs.push(entry.path);
      } else if (entry.path.endsWith('.mp4') || entry.path.endsWith('.avi')) {
        videoPaths.push(entry.path);
      }
    }

    const views = this.projectInfoService.projectInfo.views;
    const pathKeyToViewFiles = this.groupFilesByView(videoPaths, views);
    const cmp = createSessionViewComparator(this.projectInfoService.allViews());

    const sessions: Session[] = [];
    const ungroupedVideos: string[] = [];

    for (const [pathKey, groupedFiles] of pathKeyToViewFiles.entries()) {
      const knownViews = groupedFiles.filter((f) => f.view !== 'unknown');
      const unknownViews = groupedFiles.filter((f) => f.view === 'unknown');

      if (knownViews.length === 0) {
        ungroupedVideos.push(...unknownViews.map((f) => f.filename));
      } else {
        const sessionViews = knownViews.map(({ view, filename }) => ({
          viewName: view,
          videoPath: baseDir + '/' + filename,
        }));
        const key = pathKey.split('/').at(-1)!.replace(/\.(mp4|avi)$/, '');
        sessions.push({
          key,
          relativePath: pathKey,
          views: [...sessionViews].sort(cmp),
        });
        ungroupedVideos.push(...unknownViews.map((f) => f.filename));
      }
    }

    return { sessions, ungroupedDirs, ungroupedVideos };
  }

  /** Save keypoint edits for one multi-view frame to all view CSVs, optionally marking it deleted. */
  async saveMVFrame(
    labelFile: MVLabelFile,
    frame: MVFrame,
    deletion?: boolean,
  ) {
    const views: SaveFrameView[] = frame.views.map((frameView) => {
      const lbl = labelFile.views.find(
        (v) => v.viewName === frameView.viewName,
      )!;
      return {
        csvPath: lbl.csvPath,
        indexToChange: frameView.imgPath,
        changedKeypoints: fv(frameView).changedKeypoints.map(
          ({ keypointName, x, y }) => {
            return { name: keypointName, x, y };
          },
        ),
        delete: deletion,
      };
    });
    const request: SaveMvFrame = {
      views,
      unlabeledQueueDeletionOnly: mvf(frame).isFromUnlabeledSet && deletion,
    };
    return this.rpc.call('save_mvframe', {
      projectKey: this.getProjectKeyOrThrow(),
      ...request,
    });
  }

  /** Triangulate the current frame's labeled keypoints and return per-view reprojections. */
  async mvAutoLabel(
    frame: MVFrame,
    sessionKey: string,
  ): Promise<GetMVAutoLabelsResponse> {
    // Group data inside frame by keypoint name.
    const allKeypoints = frame.views
      .flatMap((fv) => {
        return fv.keypoints.map((kp) => {
          return {
            keypointName: kp.keypointName,
            view: fv.viewName,
            point: { x: kp.x, y: kp.y },
          };
        });
      })
      .filter(({ point }) => !isNaN(point.x));
    const keypointsByName = _.groupBy(allKeypoints, 'keypointName');
    // Iterate over keypointsByName and return KeypointForRequest[]
    const keypoints = Object.entries(keypointsByName).map(
      ([keypointName, labels]) => ({
        keypointName,
        labels,
      }),
    );
    const request: GetMVAutoLabelsRequest = {
      sessionKey,
      keypoints,
    };

    return this.rpc.call('getMVAutoLabels', {
      projectKey: this.getProjectKeyOrThrow(),
      ...request,
    }) as Promise<GetMVAutoLabelsResponse>;
  }

  /** Submit a training task for modelName; the scheduler picks it up and sets status to PENDING. */
  async createTrainingTask(
    modelName: string,
    configYaml: string,
  ): Promise<void> {
    await this.rpc.call('createTrainTask', {
      projectKey: this.getProjectKeyOrThrow(),
      modelName,
      configYaml,
    });
  }

  /** Create an EKS ensemble model from the given member models. */
  async createEksModel(params: {
    modelName: string;
    members: { id: string }[];
    view_names: string[];
    smooth_param: number;
    quantile_keep_pca: number;
  }): Promise<void> {
    await this.rpc.call('createEksModel', {
      projectKey: this.getProjectKeyOrThrow(),
      ...params,
    });
  }

  /** Return all model entries for the current project. */
  async listModels(): Promise<ModelListResponse> {
    const resp = (await this.rpc.call('listModels', {
      projectKey: this.getProjectKeyOrThrow(),
    })) as ModelListResponse;
    return resp;
  }

  /** Start a background inference task for the given models and sessions, returning the task ID. */
  async inferTask(
    models: string[],
    sessions: string[],
    videoRelativePaths: string[] = [],
  ): Promise<{ taskId: string }> {
    const projectKey = this.getProjectKeyOrThrow();
    return firstValueFrom(
      this.httpClient.post<{ taskId: string }>('/app/v0/inference/task', {
        projectKey,
        models,
        sessions,
        videoRelativePaths,
      }),
    );
  }

  /** Return an Observable of SSE events for taskId, completing when the task reaches a terminal state. */
  streamTaskProgress(taskId: string): Observable<TaskStreamEvent> {
    const url = `/app/v0/inference/task/${taskId}/stream`;
    return new Observable<TaskStreamEvent>((subscriber) => {
      const es = new EventSource(url);
      const onMessage = (ev: MessageEvent) => {
        try {
          const event = JSON.parse(ev.data) as TaskStreamEvent;
          subscriber.next(event);
          if (
            event.type === 'status' &&
            (event.status === 'COMPLETED' || event.status === 'FAILED' || event.status === 'CANCELLED')
          ) {
            es.close();
            subscriber.complete();
          }
        } catch {
          // ignore malformed events
        }
      };
      const onError = () => {
        try {
          es.close();
        } catch { /* ignore */ }
        subscriber.error(new Error('Inference stream error'));
      };
      es.onmessage = onMessage;
      es.onerror = onError;
      return () => {
        try {
          es.close();
        } catch { /* ignore */ }
      };
    });
  }

  /** Fetch the current status snapshot for an inference task by ID. */
  async getInferenceTaskStatus(taskId: string): Promise<InferenceTaskStatus> {
    return firstValueFrom(
      this.httpClient.get<InferenceTaskStatus>(`/app/v0/inference/task/${taskId}`),
    );
  }

  /** Return the task ID of the currently running inference task, or null if none is active. */
  async getActiveInferenceTask(): Promise<{ taskId: string | null }> {
    return firstValueFrom(
      this.httpClient.get<{ taskId: string | null }>('/app/v0/inference/task/active'),
    );
  }

  /** Request cancellation of the inference task with the given ID. */
  async cancelInferenceTask(taskId: string): Promise<void> {
    await firstValueFrom(
      this.httpClient.post<{ ok: boolean }>(`/app/v0/inference/task/${taskId}/cancel`, {}),
    );
  }

  /** Preview which inference steps would run for the given models/sessions without executing them. */
  async resolveInference(
    models: string[],
    sessions: string[],
    videoRelativePaths: string[] = [],
  ): Promise<ResolveInferenceResponse> {
    const projectKey = this.getProjectKeyOrThrow();
    return firstValueFrom(
      this.httpClient.post<ResolveInferenceResponse>('/app/v0/inference/resolve', {
        projectKey,
        models,
        sessions,
        videoRelativePaths,
      }),
    );
  }

  /** Delete a model directory by its project-relative path. */
  deleteModel(modelRelativePath: string) {
    return this.rpc.call('deleteModel', {
      projectKey: this.getProjectKeyOrThrow(),
      modelRelativePath,
    });
  }

  /** Rename a model directory to newModelName within the project's model dir. */
  renameModel(modelRelativePath: string, newModelName: string) {
    return this.rpc.call('renameModel', {
      projectKey: this.getProjectKeyOrThrow(),
      modelRelativePath,
      newModelName,
    });
  }
}

export type TranscodeStatus = 'PENDING' | 'ACTIVE' | 'DONE' | 'ERROR';
/** Transcode task progress received from the SSE stream. */
export interface VideoTaskStatus {
  transcodeStatus: TranscodeStatus;
  framesDone: number | null;
  totalFrames: number | null;
  error?: string | null;
}

export type InferenceStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/** Snapshot of an inference task's current progress and result. */
export interface InferenceTaskStatus {
  taskId: string;
  status: InferenceStatus;
  completed: number | null;
  total: number | null;
  error?: string | null;
  message?: string | null;
  logs?: string[];
}

/** Union of status-update and log-line events emitted by the inference SSE stream. */
export type TaskStreamEvent =
  | ({ type: 'status' } & InferenceTaskStatus)
  | { type: 'log'; lines: string[] };

/** One (model, session) step in an inference plan. */
export interface InferRun {
  model: string;
  session: string;
  kind: 'normal' | 'member' | 'eks';
  member_of?: string;
}

/** Preview of which inference steps would run and how many pairs are already cached. */
export interface ResolveInferenceResponse {
  runs: InferRun[];
  skipped_count: number;
}
