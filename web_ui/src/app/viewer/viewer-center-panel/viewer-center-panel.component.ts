import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Input,
  OnInit,
  signal,
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
import { Pair } from '../../pair';
import { SessionView } from '../../session.model';
import { FineVideoService } from '../../utils/fine-video.service';
import * as dfd from 'danfojs';

@Component({
  selector: 'app-viewer-center-panel',
  imports: [
    VideoPlayerControlsComponent,
    VideoTileComponent,
    KeypointContainerComponent,
  ],
  templateUrl: './viewer-center-panel.component.html',
  styleUrl: './viewer-center-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerCenterPanelComponent implements OnInit {
  sessionKey = signal<string | null>(null);
  private csvParser = inject(CsvParserService);
  private projectInfoService = inject(ProjectInfoService);
  private loadingService = inject(LoadingService);
  private fineVideoService = inject(FineVideoService);

  get currentFrame() {
    return this.videoPlayerState.currentFrameSignal;
  }

  private viewSettings = inject(ViewSettings);

  ngOnInit() {
    this.buildWidgetModels();
  }

  videoPlayerState = inject(VideoPlayerState);

  widgetModels = signal([] as VideoWidget[]);
  filteredWidgetModels = computed(() => {
    return this.widgetModels().filter((x) =>
      this.viewSettings.viewsShown().includes(x.id),
    );
  });

  buildWidgetModels(): void {
    const sessionKey = this.sessionKey();

    if (!sessionKey) return;

    // Find the full session object
    const session = this.sessionService
      .allSessions()
      .find((session) => session.key === sessionKey);
    if (!session) return; //session not found

    // Build the keypointModels computed signal for each widget model.
    this.widgetModels.set(
      //this.projectInfoService.allViews().flatMap((view) => {
      session.views.flatMap((sessionView) => {
        const keypointModels = this.projectInfoService
          .allModels()
          .flatMap((modelKey) => {
            const predictions = this.predictions.get(
              new Pair(sessionView.viewName, modelKey).toMapKey(),
            );
            if (predictions) {
              return this.projectInfoService
                .allKeypoints()
                .map((k) => this.buildKeypoint(k, predictions, modelKey));
            } else {
              return [];
            }
          });

        const widget = this.buildWidget(sessionView, keypointModels);
        return widget;
      }),
    );
  }

  private buildWidget(
    sessionView: SessionView,
    allKeypoints: KeypointImpl[],
  ): VideoWidget {
    const filteredKeypoints = computed(() => {
      return allKeypoints.filter(
        (k) =>
          this.viewSettings.modelsShown().includes(k.modelKey) &&
          this.viewSettings.keypointsShown().includes(k.name),
      );
    });
    return {
      id: sessionView.viewName,
      videoSrc: this.fineVideoService.fineVideoPath(sessionView.videoPath),
      keypoints: filteredKeypoints,
    };
  }

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
          i,
          new Pair(keypointName, 'x').toMapKey(),
        ) as number;
        const y = predictions.at(
          i,
          new Pair(keypointName, 'y').toMapKey(),
        ) as number;
        return { x, y };
      }),
    };
  }

  private sessionService = inject(SessionService);
  private predictions = this.initPredictionsArr();
  private initPredictionsArr() {
    return new Map() as Map<string, dfd.DataFrame>;
  }

  getVideoPath(sessionKey: string, view: string): string {
    const dataDir = this.projectInfoService.projectInfo?.data_dir as string;

    return dataDir + '/' + sessionKey.replace(/\*/g, view) + '.mp4';
  }

  async loadSession(sessionKey: string) {
    // not currently used for anything?
    this.sessionKey.set(sessionKey);
    this.widgetModels.set([]);
    this.predictions = this.initPredictionsArr();
    this.videoPlayerState.reset();

    this.loadingService.isLoading.set(true);
    this.loadingService.progress.set(0);
    // 1 progress for each prediction file, 1 for ffprobe
    this.loadingService.maxProgress.set(
      this.sessionService.getPredictionFilesForSession(sessionKey).length + 1,
    );

    await Promise.allSettled([
      this.loadFFProbeMetadata(),
      this.loadPredictionFiles(),
    ]);

    this.loadingService.isLoading.set(false);
    this.buildWidgetModels();
  }

  async newLoadSketchingItOutOnly(sessionKey: string) {
    // Try to make changes atomically. That is, either fully or not at all if there's some error.

    // #######
    // # Prepare (this refers to old state. new state is
    // # If models were added, fetch data. (In future
    // #######
    const predictionFilesNeeded =
        this.sessionService.getPredictionFilesForSession(sessionKey)
        .filter(pfile => {
          return this.viewSettings.viewsShown().includes(pfile.viewName) &&  this.viewSettings.modelsShown().includes(pfile.modelKey);
        });
    diffResult = diff(this.predictionFiles.keys(), predictionFilesNeeded);
    let pfilePromises = [] as Promise[];
    const newPredictionFilesMap = new Map();
    if (diffResult.new) {
      pfilePromises = diffResult.new.map(pfile => {
        // todo handle cancel in getPredictionFile...
        return this.sessionService.getPredictionFile(pfile)
          .then(handleCancel)
          .then((y) => {
            this.loadingService.progress.update((x) => x + 1);
            return y;
          })
          .then(y => {
            const parsed = this.csvParser.parsePredictionFile(y);
            newPredictionFilesMap.set(pfile, parsed);
            return parsed;
          });
      });
    }
    const parsedPfiles = await Promise.allSettled(pfilePromises);

    // ####### Commit
    if (this.canceled) {
      this.canceled = false;
      throw new Error('canceled');
    }
    const sessionChanged = sessionKey != this.sessionKey();
    if (sessionChanged) {
      this.videoPlayerState.reset();
    }
    parsedPfiles.forEach(parsed => {
      this.predictions.set(
          new Pair(pfile.viewName, pfile.modelKey).toMapKey(),
          parsed,
        );
    });
    this.widgetModels = this.buildWidgetModels();
  }

  async loadPredictionFiles() {
    const sessionKey = this.sessionKey();
    if (!sessionKey) return;

    const predictionFiles =
      this.sessionService.getPredictionFilesForSession(sessionKey);

    // Set the list of model options to those that have any predictions for this session.
    // TODO Find a proper home for this logic.
    const _models = new Set([...predictionFiles.map((p) => p.modelKey)]);
    this.viewSettings.setModelOptions(
      this.projectInfoService.allModels().filter((m) => _models.has(m)),
    );

    const requestPromises = [] as Promise<string | null>[];

    for (const pfile of predictionFiles) {
      requestPromises.push(
        this.sessionService.getPredictionFile(pfile).then((y) => {
          this.loadingService.progress.update((x) => x + 1);
          return y;
        }),
      );
    }

    const promiseStatuses = await Promise.allSettled(requestPromises);
    for (const [i, result] of promiseStatuses.entries()) {
      if (result.status === 'fulfilled') {
        const r = result.value;
        if (!r) continue; // No prediction file found.
        const pfile = predictionFiles[i];
        const parsed = this.csvParser.parsePredictionFile(r);
        this.predictions.set(
          new Pair(pfile.viewName, pfile.modelKey).toMapKey(),
          parsed,
        );
      }
    }
  }

  async loadFFProbeMetadata() {
    const sessionKey = this.sessionKey();
    if (!sessionKey) return;
    const data = await this.sessionService.ffprobe(
      this.getVideoPath(sessionKey, this.viewSettings.viewsShown()[0]),
    );
    this.videoPlayerState.duration.set(data.duration);
    this.videoPlayerState.fps.set(data.fps);
  }

  onWidgetCloseClick(w: VideoWidget) {
    const nextViewsShown = this.viewSettings
      .viewsShown()
      .filter((v) => v != w.id);
    this.viewSettings.setViewsShown(nextViewsShown);
  }
}
