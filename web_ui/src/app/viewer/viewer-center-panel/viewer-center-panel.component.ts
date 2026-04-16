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
import { VideoPlayerControlsComponent } from '../../video-player/video-player-controls/video-player-controls.component';
import { VideoTileComponent } from '../../video-player/video-tile/video-tile.component';
import { EnabledViewsKeypointsService } from '../../enabled-views-keypoints.service';
import { VideoPlayerState } from '../../video-player/video-player-state';
import { KeypointContainerComponent } from '../../keypoint-container/keypoint-container.component';
import { ViewerKeypoint } from '../../keypoint';
import { VideoMetadata } from '../../video-metadata';
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
import { ZoomableContentComponent } from '../../zoomable-content.component';
import { firstValueFrom, skipWhile } from 'rxjs';
import { ExtractedFramePredictionList } from '../../extract-frames-request';
import _ from 'lodash';
import { ColorService } from '../../infra/color.service';

import { ViewerViewOptionsService } from '../viewer-view-options.service';
import { FFProbeInfoComponent } from '../../video-player/ffprobe-info/ffprobe-info.component';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../../components/dropdown/dropdown.component';
import { ToastService } from '../../toast.service';

@Component({
  selector: 'app-viewer-center-panel',
  imports: [
    VideoPlayerControlsComponent,
    VideoTileComponent,
    KeypointContainerComponent,
    ZoomableContentComponent,
    FFProbeInfoComponent,
    DropdownComponent,
    DropdownContentComponent,
    DropdownTriggerDirective,
    DropdownTriggerComponent,
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
  private colorService = inject(ColorService);

  get currentFrame() {
    return this.videoPlayerState.currentFrameSignal;
  }

  private enabledViewsKeypoints = inject(EnabledViewsKeypointsService);
  videoPlayerState = inject(VideoPlayerState);
  protected viewOptions = inject(ViewerViewOptionsService);

  protected widgetModels = signal([] as VideoWidget[]);
  // cached prediction files for this session.
  private predictionFiles = new Map<PredictionFile, dfd.DataFrame>();
  private ffprobeData = new Map<string, VideoMetadata>();

  private buildKeypoint(
    keypointName: string,
    predictions: dfd.DataFrame,
    modelKey: string,
  ): ViewerKeypoint {
    return {
      id: `${keypointName}-${modelKey}`,
      name: keypointName,
      hoverText: keypointName,
      color: computed((): [number, number, number] => {
        const mi = this.enabledViewsKeypoints.modelsShown().indexOf(modelKey);
        if (mi == 0) return [248, 113, 113]; //bg-red-400;
        if (mi == 1) return [34, 197, 94]; // bg-green-400;
        return [224, 242, 254]; // bg-sky-100;
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
      isVisible: computed(() => {
        const i = Math.min(
          Math.max(this.currentFrame(), 0),
          predictions.index.length - 1,
        );
        const likelihoodKey = new Pair(keypointName, 'likelihood').toMapKey();
        if (predictions.columns.includes(likelihoodKey)) {
          const likelihood = predictions.at(
            i.toString(),
            likelihoodKey,
          ) as number;
          return likelihood >= this.viewOptions.likelihoodThreshold();
        }
        return true;
      }),
    };
  }

  private sessionService = inject(SessionService);
  private toastService = inject(ToastService);

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
      this.enabledViewsKeypoints.setModelOptions([]);
      this.predictionFiles = new Map();
      this.ffprobeData = new Map();
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

    // Wait for sessions to load if they're currently still loading.
    await firstValueFrom(
      this.sessionService.allSessions$.pipe(
        skipWhile(() => this.sessionService.sessionsLoading()),
      ),
    );
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
      const ffprobeDataCache = sessionChanged
        ? new Map<string, VideoMetadata>()
        : this.ffprobeData;

      if (sessionChanged) {
        promises.push(
          this.loadFFProbeMetadata(session).then((data) => {
            data.forEach((value, key) => ffprobeDataCache.set(key, value));
          }),
        );
      }
      promises.push(this.fetchDataFiles(session, predictionFileCache));
      await Promise.all(promises);

      const newWidgetModels = this.pureComputeWidgetModels(
        session,
        predictionFileCache,
        ffprobeDataCache,
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
      this.enabledViewsKeypoints.setModelOptions(availableModels);
      this.predictionFiles = predictionFileCache;
      this.ffprobeData = ffprobeDataCache;
      if (sessionChanged) {
        this.videoPlayerState.reset();
        const firstMetadata = Array.from(this.ffprobeData.values())[0];
        if (firstMetadata) {
          this.videoPlayerState.duration.set(firstMetadata.duration);
          this.videoPlayerState.fps.set(firstMetadata.fps);
        }

        this._loadedSessionKey.set(sessionKey);
      }
      this.widgetModels.set(newWidgetModels);
      this.checkMetadataConsistency(ffprobeDataCache);
    } finally {
      this.loadingService.isLoading.set(false);
    }
  }

  private checkMetadataConsistency(ffprobeData: Map<string, VideoMetadata>) {
    const fpsValues = Array.from(ffprobeData.values()).map((m) => m.fps);
    const durationValues = Array.from(ffprobeData.values()).map(
      (m) => m.duration,
    );
    const anyNotAllIntra = Array.from(ffprobeData.values()).some(
      (m) => !m.is_all_intra,
    );

    if (fpsValues.length > 1) {
      const firstFps = fpsValues[0];
      const allMatch = fpsValues.every((fps) => fps === firstFps);
      if (!allMatch) {
        this.toastService.showToast({
          content: 'Warning: Inconsistent video framerate across across views',
          variant: 'error',
        });
      }
    }

    if (durationValues.length > 1) {
      const firstDuration = durationValues[0];
      const allDurationsMatch = durationValues.every(
        (duration) => duration === firstDuration,
      );
      if (!allDurationsMatch) {
        this.toastService.showToast({
          content: 'Warning: Inconsistent video duration across views',
          variant: 'error',
        });
      }
    }

    if (anyNotAllIntra) {
      this.toastService.showToast({
        content:
          'Warning: Video is not all-intra. Frame accuracy is not guaranteed and scrubbing may not be smooth.',
        variant: 'warning',
      });
    }
  }

  private pureComputeNecessaryPredictionFiles(sessionKey: string) {
    const viewSettings = this.enabledViewsKeypoints;
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
    ffprobeData: Map<string, VideoMetadata>,
  ): VideoWidget[] {
    const viewSettings = this.enabledViewsKeypoints;
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
          metadata: ffprobeData.get(view),
          keypoints: signal(
            pfiles.flatMap((pf) => {
              return this.enabledViewsKeypoints
                .keypointsShown()
                .map((keypoint) => {
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
    const metadataMap = new Map<string, VideoMetadata>();
    const promises = session.views.map(async (sv) => {
      const data = (await this.sessionService.ffprobe(
        sv.videoPath,
      )) as VideoMetadata;
      metadataMap.set(sv.viewName, data);
    });
    await Promise.all(promises);
    return metadataMap;
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
    const nextViewsShown = this.enabledViewsKeypoints
      .viewsShown()
      .filter((v) => v != w.id);
    this.enabledViewsKeypoints.setViewsShown(nextViewsShown);
  }

  constructor() {
    this.enabledViewsKeypoints.viewsShown$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this._loadedSessionKey() == null) return;
        // Reload session.
        this.loadSessionAbort(this._loadedSessionKey() as string);
      });
    this.enabledViewsKeypoints.keypointsShown$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this._loadedSessionKey() == null) return;
        // Reload session.
        this.loadSessionAbort(this._loadedSessionKey() as string);
      });
    this.enabledViewsKeypoints.modelsShown$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this._loadedSessionKey() == null) return;
        // Reload session.
        this.loadSessionAbort(this._loadedSessionKey() as string);
      });
  }

  getPredictionsForFrameExtraction(
    modelKey: string,
  ): Record<string, ExtractedFramePredictionList> {
    const pf = Array.from(this.predictionFiles.keys()).filter(
      (key) =>
        key.modelKey === modelKey && key.sessionKey === this.sessionKey(),
    );

    const predictionLists: ExtractedFramePredictionList[] = pf.map(
      (predFile) => {
        const df = this.predictionFiles.get(predFile)!;
        const frameIndex = this.currentFrame();

        const keypoints = _.keys(
          _.keyBy(df.columns, (col) => Pair.fromMapKey(col).first),
        );
        return {
          model_name: modelKey,
          date_time: Date.now(),
          view_name: predFile.viewName,
          predictions: keypoints.map((keypoint) => {
            const x = df.at(
              frameIndex.toString(),
              new Pair(keypoint, 'x').toMapKey(),
            ) as number;
            const y = df.at(
              frameIndex.toString(),
              new Pair(keypoint, 'y').toMapKey(),
            ) as number;

            return {
              keypoint_name: keypoint,
              x: x,
              y: y,
            };
          }),
        };
      },
    );
    return _.keyBy(predictionLists, 'view_name');
  }
}
