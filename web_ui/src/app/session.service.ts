import { inject, Injectable, signal } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  distinctUntilChanged,
  firstValueFrom,
  Observable,
  of,
} from 'rxjs';
import { Session, SessionView } from './session.model';
import { RpcService } from './rpc.service';
import { ProjectInfoService } from './project-info.service';
import { PredictionFile } from './prediction-file';
import { HttpClient } from '@angular/common/http';
import { CsvParserService } from './csv-parser.service';
import { FFProbeInfo } from './ffprobe-info';
import { toSignal } from '@angular/core/rxjs-interop';
import { createSessionViewComparator } from './utils/comparators';
import { LabelFile } from './label-file.model';

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

  sessionsLoading = signal(false);
  private _allSessions = new BehaviorSubject<Session[]>([]);
  allSessions$ = this._allSessions.asObservable();
  allSessions = toSignal(this.allSessions$, { requireSync: true });

  private sessionModelMap = {} as SessionModelMap;

  async loadSessions() {
    try {
      this.sessionsLoading.set(true);
      await this._loadSessions();
    } finally {
      this.sessionsLoading.set(false);
    }
  }
  async _loadSessions() {
    const projectInfo = this.projectInfoService.projectInfo;

    const response = (await this.rpc.call('rglob', {
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

    return this._allSessions.next(sessions);
  }

  labelFilesLoading = signal(false);
  private _allLabelFiles = new BehaviorSubject<LabelFile[]>([]);
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
    const projectInfo = this.projectInfoService.projectInfo;

    const response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.data_dir,
      pattern: '**/*.csv',
      noDirs: true,
    })) as RGlobResponse;

    const csvFiles: string[] = response.entries
      .filter((entry) => {
        if (entry.path.endsWith('_bbox.csv')) return false;
        if (entry.path.endsWith('_error.csv')) return false;
        if (entry.path.endsWith('_loss.csv')) return false;
        if (entry.path.endsWith('_norm.csv')) return false;

        return true;
      })
      .map((entry) => entry.path);
    const cmp = createSessionViewComparator(this.projectInfoService.allViews());

    const files: LabelFile[] = Array.from(
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
      path: file,
    })) as FFProbeInfo;

    return response;
  }

  getAvailableModelsForSession(sessionKey: string): string[] {
    return this.sessionModelMap[sessionKey] || [];
  }

  private groupFilesBySession(filenames: string[], views: string[]): Session[] {
    const sessionKeyToItsViewFiles = this.groupFilesByView(filenames, views);
    // Convert the Map to the required Session array format
    const cmp = createSessionViewComparator(this.projectInfoService.allViews());
    return Array.from(sessionKeyToItsViewFiles.entries()).map(
      ([key, groupedFiles]) => {
        const sessionViews = groupedFiles.map(({ view, filename }) => ({
          viewName: view,
          videoPath:
            this.projectInfoService.projectInfo.data_dir + '/' + filename,
        }));
        return {
          key: key.replace(/\.mp4$/, ''),
          views: [...sessionViews].sort(cmp),
        };
      },
    );
  }
  private groupFilesByView(
    filenames: string[],
    views: string[],
  ): Map<string, { view: string; filename: string }[]> {
    // Use a Map to group files by their session key
    const sessionKeyToItsViewFiles = new Map<
      string,
      { view: string; filename: string }[]
    >();

    for (const filename of filenames) {
      let viewName = views.find((v) => filename.includes(v));
      if (!viewName) {
        viewName = 'unknown';
      }

      // Remove the view name to get the base session key
      const sessionKey =
        viewName == 'unknown' ? filename : filename.replace(viewName, '*');

      if (!sessionKeyToItsViewFiles.has(sessionKey)) {
        sessionKeyToItsViewFiles.set(sessionKey, []);
      }
      sessionKeyToItsViewFiles.get(sessionKey)!.push({
        view: viewName,
        filename: filename,
      });
      /*
      sessionKeyToItsViewFiles.get(sessionKey)!.push({
        viewName,
        videoPath: projectInfo.data_dir + '/' + filename,
      });
       */
    }
    return sessionKeyToItsViewFiles;
  }
}

interface RGlobResponse {
  entries: {
    type: string;
    path: string;
  }[];
}
