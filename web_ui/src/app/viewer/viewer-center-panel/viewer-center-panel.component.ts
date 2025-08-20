import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnChanges,
  signal,
  SimpleChanges,
} from '@angular/core';
import { VideoPlayerControlsComponent } from '../../components/video-player/video-player-controls/video-player-controls.component';
import { VideoTileComponent } from '../../components/video-player/video-tile/video-tile.component';
import { ViewSettings } from '../../view-settings.model';
import { VideoPlayerState } from '../../components/video-player/video-player-state';
import { KeypointContainerComponent } from '../../components/keypoint-container/keypoint-container.component';
import { KeypointImpl } from '../../keypoint';
import { VideoWidget } from '../../video-widget';

import { CsvParserService } from '../../csv-parser.service';
import { ProjectInfoService } from '../../project-info.service';
import { SessionService } from '../../session.service';
import { LoadingService } from '../../loading.service';
import { Pair } from '../../utils/pair';
import { Session } from '../../session.model';
import { FineVideoService } from '../../utils/fine-video.service';
import * as dfd from 'danfojs';
import { PredictionFile } from '../../prediction-file';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ZoomableContentComponent } from '../../components/zoomable-content.component';

@Component({
  selector: 'app-viewer-center-panel',
  imports: [
    VideoPlayerControlsComponent,
    VideoTileComponent,
    KeypointContainerComponent,
    ZoomableContentComponent,
  ],
  templateUrl: './viewer-center-panel.component.html',
  styleUrl: './viewer-center-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerCenterPanelComponent implements OnChanges {
  sessionKey = input<string | null>(null);
  _loadedSessionKey = signal<string | null>(null);
  private csvParser = inject(CsvParserService);
  private projectInfoService = inject(ProjectInfoService);
  private loadingService = inject(LoadingService);
  private fineVideoService = inject(FineVideoService);
  private loadSessionAbortController?: AbortController = undefined;

  get currentFrame() {
    return this.videoPlayerState.currentFrameSignal;
  }

  private viewSettings = inject(ViewSettings);
  videoPlayerState = inject(VideoPlayerState);

  protected widgetModels = signal([] as VideoWidget[]);
  // cached prediction files for this session.
  private predictionFiles = new Map<PredictionFile, dfd.DataFrame>();

  private buildKeypoint(
    keypointName: string,
    predictions: dfd.DataFrame,
    modelKey: string,
  ): KeypointImpl {
    return {
      id: keypointName + modelKey,
      name: keypointName,
      hoverText: keypointName,
      colorClass: computed(() => {
        const mi = this.viewSettings.modelsShown().indexOf(modelKey);
        if (mi == 0) return 'bg-red-400'; ///50';
        if (mi == 1) return 'bg-green-400'; ///50';
        return 'bg-sky-100'; ///50';
      }),
      modelKey,
      position: computed(() => {
        const i = Math.min(
          Math.max(this.currentFrame(), 0),
          predictions.index.length - 1,
        );
        const x = predictions.at(
          i.toString(),
          new Pair(keypointName, 'x').toMapKey(),
        ) as number;
        const y = predictions.at(
          i.toString(),
          new Pair(keypointName, 'y').toMapKey(),
        ) as number;
        return { x, y };
      }),
    };
  }

  private sessionService = inject(SessionService);

  private getVideoPathForFFProbe(sessionKey: string, view: string): string {
    const dataDir = this.projectInfoService.projectInfo?.data_dir as string;

    return dataDir + '/' + sessionKey.replace(/\*/g, view);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['sessionKey']) {
      this.loadSessionAbort(this.sessionKey()!);
    }
  }

  private async loadSessionAbort(sessionKey: string | null) {
    if (this.loadSessionAbortController) {
      this.loadSessionAbortController.abort();
    }
    this.loadSessionAbortController = new AbortController();
    await this.loadSession(sessionKey, this.loadSessionAbortController.signal);
  }

  private async loadSession(
    sessionKey: string | null,
    abortSignal: AbortSignal,
  ) {
    if (sessionKey == null) {
      this.viewSettings.setModelOptions([]);
      this.predictionFiles = new Map();
      this.videoPlayerState.reset();
      this.videoPlayerState.duration.set(0);
      this.videoPlayerState.fps.set(30);
      this._loadedSessionKey.set(sessionKey);
      this.widgetModels.set([]);
      return;
    }
    this.loadingService.isLoading.set(true);
    this.loadingService.progress.set(0);

    const sessionChanged = sessionKey != this._loadedSessionKey();

    try {
      const session = this.sessionService
        .allSessions()
        .find((session) => session.key === sessionKey);
      if (!session) {
        throw new Error(
          `Session not found: {sessionKey} in ${this.sessionService.allSessions()}`,
        );
      }

      // ##################################
      // Prepare by fetching relevant data.
      // TODO: pass abort signal into the fetch functions to make them cancel when needed.
      // ##################################
      const promises = [];
      const predictionFileCache = sessionChanged
        ? new Map<PredictionFile, dfd.DataFrame>()
        : this.predictionFiles;
      let ffprobeData = null;
      if (sessionChanged) {
        promises.push(
          this.loadFFProbeMetadata(session).then((data) => {
            ffprobeData = data;
          }),
        );
      }
      promises.push(this.fetchDataFiles(session, predictionFileCache));
      await Promise.all(promises);

      const newWidgetModels = this.pureComputeWidgetModels(
        session,
        predictionFileCache,
      );

      const availableModels = Array.from(
        new Set([
          ...this.sessionService
            .getPredictionFilesForSession(sessionKey)
            .map((pf) => pf.modelKey),
        ]),
      );

      // ##################################
      // Commit changes (only happens if everything above was successful.
      // ##################################
      if (abortSignal.aborted) {
        return;
      }
      this.viewSettings.setModelOptions(availableModels);
      this.predictionFiles = predictionFileCache;
      if (sessionChanged) {
        this.videoPlayerState.reset();
        this.videoPlayerState.duration.set(ffprobeData!.duration);
        this.videoPlayerState.fps.set(ffprobeData!.fps);

        this._loadedSessionKey.set(sessionKey);
      }
      this.widgetModels.set(newWidgetModels);
    } finally {
      this.loadingService.isLoading.set(false);
    }
  }

  private pureComputeNecessaryPredictionFiles(sessionKey: string) {
    const viewSettings = this.viewSettings;
    if (!sessionKey) return [];

    const predictionFiles =
      this.sessionService.getPredictionFilesForSession(sessionKey);
    const necessaryPredictionFiles = predictionFiles.filter((pf) => {
      return (
        viewSettings.modelsShown().includes(pf.modelKey) &&
        viewSettings.viewsShown().includes(pf.viewName)
      );
    });
    return necessaryPredictionFiles;
  }
  private pureComputeWidgetModels(
    session: Session,
    predictionFileCache: Map<PredictionFile, dfd.DataFrame>,
  ): VideoWidget[] {
    const viewSettings = this.viewSettings;
    const sessionKey = this._loadedSessionKey();
    if (!sessionKey) return [];
    return viewSettings
      .viewsShown()
      .map((view): VideoWidget | null => {
        const sessionView = session.views.find((sv) => sv.viewName == view);
        if (!sessionView) return null;

        const pfiles = Array.from(predictionFileCache.keys()).filter(
          (pfile) =>
            pfile.viewName == view &&
            viewSettings.modelsShown().includes(pfile.modelKey),
        );
        return {
          id: view,
          videoSrc: this.fineVideoService.fineVideoPath(sessionView.videoPath),
          keypoints: signal(
            pfiles.flatMap((pf) => {
              return this.viewSettings.keypointsShown().map((keypoint) => {
                return this.buildKeypoint(
                  keypoint,
                  predictionFileCache.get(pf) as dfd.DataFrame,
                  pf.modelKey,
                );
              });
            }),
          ),
        };
      })
      .filter((item) => item != null);
  }

  private async loadFFProbeMetadata(session: Session) {
    return await this.sessionService.ffprobe(
      this.getVideoPathForFFProbe(
        session.relativePath,
        session.views[0].viewName,
      ),
    );
  }
  private async fetchDataFiles(
    session: Session,
    predictionFileCache: Map<PredictionFile, dfd.DataFrame>,
  ) {
    const necessaryPredictionFiles = this.pureComputeNecessaryPredictionFiles(
      session.key,
    );
    const promises = necessaryPredictionFiles.map(async (pf) => {
      if (this.predictionFiles.has(pf)) {
        return Promise.resolve(predictionFileCache.get(pf));
      }
      const rawText = await this.sessionService.getPredictionFile(pf);
      if (rawText == null) {
        throw new Error('Prediction file not found');
      }
      const df = this.csvParser.parsePredictionFile(rawText);
      predictionFileCache.set(pf, df);
      return df;
    });
    return Promise.all(promises);
  }

  onWidgetCloseClick(w: VideoWidget) {
    const nextViewsShown = this.viewSettings
      .viewsShown()
      .filter((v) => v != w.id);
    this.viewSettings.setViewsShown(nextViewsShown);
  }

  constructor() {
    this.viewSettings.viewsShown$.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this._loadedSessionKey() == null) return;
      // Reload session.
      this.loadSessionAbort(this._loadedSessionKey() as string);
    });
    this.viewSettings.keypointsShown$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this._loadedSessionKey() == null) return;
        // Reload session.
        this.loadSessionAbort(this._loadedSessionKey() as string);
      });
    this.viewSettings.modelsShown$.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this._loadedSessionKey() == null) return;
      // Reload session.
      this.loadSessionAbort(this._loadedSessionKey() as string);
    });
  }
}
