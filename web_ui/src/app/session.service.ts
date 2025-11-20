import { computed, inject, Injectable, signal } from '@angular/core';
import { BehaviorSubject, Observable, catchError, firstValueFrom } from 'rxjs';
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
import { fv, MVFrame } from './labeler/frame.model';
import { SaveFrameView, SaveMvFrame } from './labeler/save-mvframe';
import {
  GetMVAutoLabelsRequest,
  GetMVAutoLabelsResponse,
} from './labeler/mv-autolabel';
import _ from 'lodash';
import { ModelListResponse } from './modelconf';

type SessionModelMap = Record<string, string[]>;

@Injectable({
  providedIn: 'root',
})
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

  private getProjectKeyOrThrow(): string {
    const ctx = this.projectInfoService.projectContext();
    if (!ctx?.key) throw new Error('Project key missing from project context');
    return ctx.key;
  }

  async loadSessions() {
    /** This store is populated lazily the first time someone calls loadSessions.
     * Subsequent loadSession calls are noop. User should refresh page, until
     * we implement a {reload: true} option. */
    if (this.allSessions().length > 1) return;
    try {
      this.sessionsLoading.set(true);
      const sessions = await this._loadSessions();
      this.sessionsLoading.set(false);
      this._allSessions.next(sessions);
    } catch {
      this.sessionsLoading.set(false);
    }
  }
  async _loadSessions() {
    const projectInfo = this.projectInfoService.projectInfo;

    const response = (await this.rpc.call('rglob', {
      projectKey: this.getProjectKeyOrThrow(),
      baseDir: projectInfo.data_dir,
      pattern: '**/*.mp4',
      noDirs: true,
    })) as RGlobResponse;

    /* To test long request:
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    await sleep(1000);
     */

    const mp4Files: string[] = response.entries.map((entry) => entry.path);

    const sessions: Session[] = this.groupFilesBySession(
      mp4Files,
      this.projectInfoService.projectInfo.views,
    );

    return sessions;
  }

  labelFilesLoading = signal(false);
  private _allLabelFiles = new BehaviorSubject<MVLabelFile[]>([]);
  allLabelFiles$ = this._allLabelFiles.asObservable();
  allLabelFiles = toSignal(this.allLabelFiles$, { requireSync: true });

  async loadLabelFiles() {
    try {
      this.labelFilesLoading.set(true);
      await this._loadLabelFiles();
    } finally {
      this.labelFilesLoading.set(false);
    }
  }
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

  async loadPredictionIndex() {
    /* Finds all prediction files in model directory to update
    application's state: available prediction files and their metadata. */
    const projectInfo = this.projectInfoService.projectInfo;
    // Search for all CSV files.
    const response = (await this.rpc.call('rglob', {
      projectKey: this.getProjectKeyOrThrow(),
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
        const viewName = this.projectInfoService
          .allViews()
          .find((v) => sessionView.includes(v));
        if (!viewName) return null; // cannot parse viewname.
        const sessionKey = sessionView.replace(viewName, '*');

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

  getPredictionFilesForSession(sessionKey: string): PredictionFile[] {
    const predictionFiles = this.predictionFiles.filter(
      (p) => p.sessionKey === sessionKey,
    );
    return predictionFiles;
  }

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

  async ffprobe(file: string): Promise<FFProbeInfo> {
    const response = (await this.rpc.call('ffprobe', {
      projectKey: this.getProjectKeyOrThrow(),
      path: file,
    })) as FFProbeInfo;

    return response;
  }

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
              return [null];
            }
            throw error;
        }),
      ),
    );
  }

  async createTrainTask(yamlText: string): Promise<void> {
    // RPC stub for creating a training task. Intentionally unimplemented.
    // When implemented, it should likely call an RPC endpoint like '/app/v0/rpc/createTrainTask'
    // with a payload containing the YAML string.
    void yamlText;
    return;
  }

  getAvailableModelsForSession(sessionKey: string): string[] {
    return this.sessionModelMap[sessionKey] || [];
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
          .replace(/\.mp4$/, '');
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

  async saveMVFrame(labelFile: MVLabelFile, frame: MVFrame) {
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
      };
    });
    const request: SaveMvFrame = { views };
    return this.rpc.call('save_mvframe', {
      projectKey: this.getProjectKeyOrThrow(),
      ...request,
    });
  }

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

  async hasCameraCalibrationFiles(sessionKey: string): Promise<boolean> {
    const projectInfo = this.projectInfoService.projectInfo;

    // Search for session-level calibration file.
    let response = (await this.rpc.call('rglob', {
      projectKey: this.getProjectKeyOrThrow(),
      baseDir: projectInfo.data_dir,
      pattern: `calibrations/${sessionKey}.toml`,
      noDirs: true,
    })) as RGlobResponse;
    if (response.entries.length > 0) {
      return true;
    }

    // Search for project-level calibration file.
    response = (await this.rpc.call('rglob', {
      projectKey: this.getProjectKeyOrThrow(),
      baseDir: projectInfo.data_dir,
      pattern: `calibration.toml`,
      noDirs: true,
    })) as RGlobResponse;
    if (response.entries.length > 0) {
      return true;
    }

    return false;
  }

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

  async listModels(): Promise<ModelListResponse> {
    const resp = (await this.rpc.call('listModels', {
      projectKey: this.getProjectKeyOrThrow(),
    })) as ModelListResponse;
    return resp;
  }
}

interface RGlobResponse {
  entries: {
    type: string;
    path: string;
  }[];
}
