import { inject, Injectable } from '@angular/core';
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

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private rpc = inject(RpcService);
  private httpClient = inject(HttpClient);

  private allSessions = new BehaviorSubject<Session[]>([]);
  private predictionFiles = [] as PredictionFile[];
  private projectInfoService = inject(ProjectInfoService);
  private csvParser = inject(CsvParserService);

  getAllSessions(): Observable<Session[]> {
    return this.allSessions.asObservable();
  }

  async loadSessions() {
    const projectInfo = this.projectInfoService.projectInfo;
    const response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.data_dir,
      pattern: '**/*.fine.mp4', //temporary
      noDirs: true,
    })) as RGlobResponse;
    const mp4Files: string[] = response.entries
      .filter((entry) => entry.type === 'file')
      .map((entry) => entry.path);
    const sessions: Session[] = getUniqueSessionTemplates(
      mp4Files,
      this.projectInfoService.projectInfo.views,
    ).map((templateName) => {
      return { key: templateName.replace(/\.mp4$/, '') };
    });
    return this.allSessions.next(sessions);
  }

  async loadPredictionIndex() {
    const projectInfo = this.projectInfoService.projectInfo;
    const response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.model_dir,
      pattern: '**/video_preds/**/*.csv',
      noDirs: true,
    })) as RGlobResponse;
    this.predictionFiles = response.entries
      .filter((entry) => {
        if (entry.type !== 'file') return false;
        if (entry.path.endsWith('_bbox.csv')) return false;
        if (entry.path.endsWith('_error.csv')) return false;
        if (entry.path.endsWith('_loss.csv')) return false;
        if (entry.path.endsWith('_norm.csv')) return false;

        return true;
      })
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

        return {
          path: entry.path,
          modelKey,
          sessionKey,
          viewName,
        };
      })
      .filter((entry) => entry != null);

    // After loading predictions, hydrate the stores that depend on this info.
    this.initModels();
    await this.initKeypoints();
  }

  private initModels() {
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
      (p) =>
        p.sessionKey === sessionKey ||
        p.sessionKey === sessionKey.replace(/\.fine$/, ''),
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
}

function getUniqueSessionTemplates(
  filenames: string[],
  views: string[],
): string[] {
  // A Set will store only unique session templates
  const sessionTemplates = new Set<string>();

  // Regular expression to find "_Cam-" followed by a single uppercase letter A-F, followed by "_"
  // The [A-F] part ensures we only match the specified camera identifiers.

  for (const filename of filenames) {
    const viewName = views.find((v) => filename.includes(v));
    const sessionTemplate = viewName
      ? filename.replace(viewName, '*')
      : filename;
    if (!sessionTemplates.has(sessionTemplate)) {
      sessionTemplates.add(sessionTemplate);
    }
  }

  // Convert the Set back to an array
  return Array.from(sessionTemplates);
}
interface RGlobResponse {
  entries: {
    type: string;
    path: string;
  }[];
}
