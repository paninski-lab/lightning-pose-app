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
import { NdArray } from 'ndarray'; // Import ndarray and its type

import { CsvParserService } from '../../csv-parser.service';
import { ProjectInfoService } from '../../project-info.service';
import { SessionService } from '../../session.service';
import { LoadingService } from '../../loading.service';
import { Pair } from '../../pair';
import { SessionView } from '../../session.model';
import { firstValueFrom } from 'rxjs';

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

  get currentFrame() {
    return this.videoPlayerState.currentFrameSignal;
  }

  @Input() viewSettings: ViewSettings = {} as ViewSettings;

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
      videoSrc: this.getVideoSrc(sessionView),
      keypoints: filteredKeypoints,
    };
  }

  private buildKeypoint(
    keypointName: string,
    predictions: NdArray,
    modelKey: string,
  ): KeypointImpl {
    // Index of the keypoints in allKeypoints will match the
    // index of the keypoints in the predictions array.
    const kpi = this.projectInfoService.allKeypoints().indexOf(keypointName);

    return {
      id: keypointName + modelKey,
      name: keypointName,
      hoverText: keypointName,
      colorClass: computed(() => {
        const mi = this.viewSettings.modelsShown().indexOf(modelKey);
        if (mi == 0) return 'bg-red-400';
        if (mi == 1) return 'bg-green-400';
        return 'bg-sky-100';
      }),
      modelKey,
      position: computed(() => {
        return {
          // j = keypoint index, 0|1 = x|y
          x: predictions.get(this.currentFrame(), kpi, 0),
          y: predictions.get(this.currentFrame(), kpi, 1),
        };
      }),
    };
  }

  private sessionService = inject(SessionService);
  private predictions = this.initPredictionsArr();
  private initPredictionsArr() {
    // a Map from Pair<view_name, model_key> to NDArray of its prediction file.
    return new Map() as Map<string, NdArray<Float64Array>>;
    // return ndarray([], [1 /*numModels*/, 6 /*numViews*/]);
  }

  getVideoPath(sessionKey: string, view: string): string {
    const dataDir = this.projectInfoService.projectInfo?.data_dir as string;

    return dataDir + '/' + sessionKey.replace(/\*/g, view) + '.mp4';
  }
  getVideoSrc(sessionView: SessionView): string {
    //return '/videos/' + sessionKey.replace(/Cam-N/g, 'Cam-' + view) + '.mp4';
    return '/app/v0/files/' + sessionView.videoPath;
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
    await this.buildWidgetModels();
  }

  async loadPredictionFiles() {
    const sessionKey = this.sessionKey();
    if (!sessionKey) return;

    const predictionFiles =
      this.sessionService.getPredictionFilesForSession(sessionKey);

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
          parsed as NdArray<Float64Array>,
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
