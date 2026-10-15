import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Input,
  NgZone,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../../components/dropdown/dropdown.component';
import { ViewerSessionsPanelComponent } from '../viewer-left-panel/viewer-sessions-panel.component';
import { EnabledViewsKeypointsService } from '../../enabled-views-keypoints.service';
import { VideoPlayerState } from '../../video-player/video-player-state';
import { ViewerCenterPanelComponent } from '../viewer-center-panel/viewer-center-panel.component';
import { ProjectInfoService } from '../../project-info.service';
import { SelectionModel } from '@angular/cdk/collections';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionService } from '../../session.service';
import { LoadingBarComponent } from '../../loading-bar/loading-bar.component';
import { LoadingService } from '../../loading.service';
import { Session } from '../../session.model';
import { Router } from '@angular/router';
import { LabelFilePickerComponent } from '../../label-file-picker/label-file-picker.component';
import { RpcService } from '../../rpc.service';
import { ExtractFramesRequest } from '../../extract-frames-request';
import { ToastService } from '../../toast.service';
import _ from 'lodash';
import { SplitAreaComponent, SplitComponent } from 'angular-split';
import { FormsModule } from '@angular/forms';

import { ViewerViewOptionsService } from '../viewer-view-options.service';
import { SelectComponent } from '../../components/dropdown/select.component';
import { RunModelInferenceDialogComponent } from '../../run-model-inference-dialog/run-model-inference-dialog.component';

import { SessionImportComponent } from '../../session-import/session-import.component';
import { LoadCalibrationDialogComponent } from '../../file-manager/load-calibration-dialog.component';
import { SkeletonViewOptionsComponent } from '../../components/skeleton-view-options/skeleton-view-options.component';
import { isSkeletonDefinitionInvalid } from '../../components/skeleton-overlay/skeleton-validity';
import {
  clampSplitPane,
  gutterPixels,
  playbackBarMinWidth,
} from '../../split-pane-limit';

@Component({
  selector: 'app-viewer',
  imports: [
    ViewerSessionsPanelComponent,
    ViewerCenterPanelComponent,
    LoadingBarComponent,
    LabelFilePickerComponent,
    SplitComponent,
    SplitAreaComponent,
    FormsModule,
    SelectComponent,
    DropdownComponent,
    DropdownTriggerComponent,
    DropdownContentComponent,
    DropdownTriggerDirective,
    RunModelInferenceDialogComponent,
    SessionImportComponent,
    LoadCalibrationDialogComponent,
    SkeletonViewOptionsComponent,
  ],
  templateUrl: './viewer-page.component.html',
  styleUrl: './viewer-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    VideoPlayerState,
    EnabledViewsKeypointsService,
    ViewerViewOptionsService,
  ],
})
export class ViewerPageComponent implements OnInit {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);
  private leftPane = viewChild<SplitAreaComponent>('leftPane');
  private rightPane = viewChild<SplitAreaComponent>('rightPane');
  /** Side panes stop before they cover the playback bar or each other. */
  protected leftPaneMax = signal(10000);
  protected rightPaneMax = signal(10000);
  protected leftPaneSize = signal(280);
  protected rightPaneSize = signal(280);

  enabledViewsKeypoints = inject(EnabledViewsKeypointsService);
  viewOptions = inject(ViewerViewOptionsService);
  protected skeletonInvalid = computed(() => {
    const info = this.projectInfoService.projectContext()?.projectInfo;
    if (!info) return false;
    return isSkeletonDefinitionInvalid(info.skeleton, info.keypoint_names);
  });
  projectInfoService = inject(ProjectInfoService);
  sessionService = inject(SessionService);
  loadingService = inject(LoadingService);

  protected keypointSelectionModel: SelectionModel<string>;
  protected viewSelectionModel: SelectionModel<string>;
  protected allViews = [] as string[];
  private router = inject(Router);
  protected videoPlayerState = inject(VideoPlayerState);
  private rpc = inject(RpcService);
  private toastService = inject(ToastService);

  /**
   * Set by the router when there is a session key in the path.
   *
   * Flow: user clicks link -> Router -> ViewerPageComponent.
   *
   * @param sessionKey
   */
  @Input() set sessionKey(sessionKey: string | null) {
    this._sessionKey.set(sessionKey);
    if (sessionKey == null) {
      // todo
      return;
    }
  }

  _sessionKey = signal<string | null>(null);

  protected isIniting = signal(true);
  protected isRunModelInferenceDialogOpen = signal(false);
  protected sessionImportOpen = signal(false);
  protected calibrationImportOpen = signal(false);
  protected isMultiview = computed(
    () =>
      (this.projectInfoService.projectContext()?.projectInfo?.views?.length ??
        0) > 1,
  );
  async ngOnInit() {
    // Page inits by loading project info, and if it does not exist,
    // it will (future) open a dialog to get the project info.

    this.loadingService.isLoading.set(true);
    this.loadingService.maxProgress.set(1);
    this.loadingService.progress.set(0);

    // Load sessions and prediction index, but don't wait, just fire off the request.
    const p = this.sessionService.loadPredictionIndex();

    this.allViews = this.projectInfoService.allViews();
    p.then(() => {
      this.keypointSelectionModel.select(
        ...this.projectInfoService.allKeypoints(),
      );
      this.loadingService.progress.update((x) => x + 1);
    }).then(() => {
      this.loadingService.isLoading.set(false);
    });
    this.viewSelectionModel.select(...this.allViews);

    if (this.projectInfoService.projectInfo == null) {
      throw new Error('No file at ~/.lightning_pose/project.toml');
    }
    this.isIniting.set(false);
  }

  constructor() {
    this.keypointSelectionModel = new SelectionModel<string>(true, []);
    this.viewSelectionModel = new SelectionModel<string>(true, []);

    //
    // Setup two-way binding between the selection model of `select` and viewSettings state.
    //

    // Propagate changes from our selection model to the viewSettings store.
    this.viewSelectionModel.changed
      .asObservable()
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.enabledViewsKeypoints.setViewsShown(
          this.viewSelectionModel.selected,
        );
      });

    // Propagate changes from viewSettings store to our selection model.
    this.enabledViewsKeypoints.viewsShown$
      .pipe(takeUntilDestroyed())
      .subscribe((viewsShown) => {
        this.viewSelectionModel.setSelection(...viewsShown);
      });

    this.keypointSelectionModel.changed
      .asObservable()
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.enabledViewsKeypoints.setKeypointsShown(
          this.keypointSelectionModel.selected,
        );
      });
    this.enabledViewsKeypoints.keypointsShown$
      .pipe(takeUntilDestroyed())
      .subscribe((keypointsShown) => {
        this.keypointSelectionModel.setSelection(...keypointsShown);
      });

    afterNextRender(() => {
      const split = this.host.nativeElement.querySelector('as-split');
      if (!split) return;
      const observer = new ResizeObserver(() => {
        this.zone.run(() => this.limitSidePanes());
      });
      observer.observe(split);
      this.destroyRef.onDestroy(() => observer.disconnect());
      this.limitSidePanes();
    });
  }

  /** Keep both side panes on screen, and leave the playback bar fully visible. */
  protected limitSidePanes() {
    const split = this.host.nativeElement.querySelector('as-split');
    const left = this.leftPane();
    const right = this.rightPane();
    if (!split || !left || !right) return;
    const areas = [...split.querySelectorAll(':scope > as-split-area')];
    const gutterWidth = gutterPixels(split);
    const controls = split.querySelector('.video-controls-container');
    const controlsMin =
      controls instanceof HTMLElement ? measuredPlaybackBarMin(controls) : 0;
    const leftWidth = areas[0]?.clientWidth ?? 0;
    const rightWidth = areas[areas.length - 1]?.clientWidth ?? 0;
    const room = split.clientWidth - gutterWidth - controlsMin;
    clampSplitPane(
      this.leftPaneSize,
      this.leftPaneMax,
      room - rightWidth,
      leftWidth,
    );
    clampSplitPane(
      this.rightPaneSize,
      this.rightPaneMax,
      room - leftWidth,
      rightWidth,
    );
  }

  protected onKeypointCheckboxChange(event: Event, keypointName: string) {
    const target = event.target as HTMLInputElement;
    if (target.checked) {
      this.keypointSelectionModel.select(keypointName);
    } else {
      this.keypointSelectionModel.deselect(keypointName);
    }
  }

  protected onViewCheckboxChange(event: Event, cam: string) {
    const target = event.target as HTMLInputElement;
    if (target.checked) {
      this.viewSelectionModel.select(cam);
    } else {
      this.viewSelectionModel.deselect(cam);
    }
  }

  protected noneOption = '- None -';
  protected toSelectOption(item: string) {
    return {
      label: item,
      value: item,
    };
  }
  protected onModelSelected(index: number, modelKey: string) {
    const modelsShown = [...this.enabledViewsKeypoints.modelsShown()];
    if (modelKey === this.noneOption) {
      // Remove the model.
      modelsShown.splice(index, 1);
    } else {
      modelsShown[index] = modelKey;
    }

    this.enabledViewsKeypoints.setModelsShown(modelsShown);
  }

  protected async handleRunModelInferenceDialogDone() {
    this.isRunModelInferenceDialogOpen.set(false);
    await this.sessionService.loadPredictionIndex();
  }

  /** Called when the Session Import dialog finishes/closed. */
  protected async onImportDone() {
    // Close the import dialog UI
    this.sessionImportOpen.set(false);
    // Refresh the sessions list so the table reflects any newly transcoded videos
    try {
      await this.sessionService.loadSessions();
    } catch (e) {
      // Non-fatal: keep UI responsive even if refresh fails
      console.error('Failed to refresh sessions after import dialog closed', e);
    }
  }

  protected handleSelectedSessionChange(session: Session | null) {
    const projectKey = this.projectInfoService.projectContext()?.key as
      | string
      | undefined;
    if (!projectKey) {
      throw new Error('Project key missing from project context');
    }

    if (session === null) {
      this.router.navigate(['/project', projectKey, 'viewer']);
    } else {
      this.router.navigate(['/project', projectKey, 'viewer', session.key]);
    }
  }

  protected extractFramesLabelFileKey = signal<string | null>(null);
  protected isExtractFramesLoading = signal(false);
  protected duplicateFrameOpen = signal(false);

  protected isExtractFramesInteractionDisabled() {
    return (
      !this._sessionKey() ||
      this.videoPlayerState.isPlayingSignal() ||
      this.isExtractFramesLoading()
    );
  }

  partialViewsErrorsDialog =
    viewChild<ElementRef<HTMLDialogElement>>('partialViewsError');
  partialModelsErrorsDialog =
    viewChild<ElementRef<HTMLDialogElement>>('partialModelsError');

  protected showPartialViewsErrors() {
    this.partialViewsErrorsDialog()?.nativeElement.showModal();
  }
  protected showPartialModelsError() {
    this.partialModelsErrorsDialog()?.nativeElement.showModal();
  }
  protected onExtractFrameShortcut() {
    if (
      this.isExtractFramesInteractionDisabled() ||
      !this.extractFramesLabelFileKey()
    ) {
      return;
    }
    this.handleExtractFramesClick();
  }
  protected async handleExtractFramesClick() {
    if (this.enabledViewsKeypoints.modelsShown().length > 1) {
      this.showPartialModelsError();
      return;
    }
    if (
      !_.isEqual(
        this.enabledViewsKeypoints.viewsShown(),
        this.projectInfoService.allViews(),
      ) ||
      !_.isEqual(
        this.enabledViewsKeypoints.keypointsShown(),
        this.projectInfoService.allKeypoints(),
      )
    ) {
      this.showPartialViewsErrors();
      return;
    }
    const request = this.toExtractFramesRequest();
    const frame = request.manualFrameOptions?.frame_index_list[0];
    this.isExtractFramesLoading.set(true);
    try {
      const preview = (await this.rpc.call('validateExtractFrames', request)) as {
        conflicts?: string[];
      };
      if (preview.conflicts?.length) {
        this.duplicateFrameOpen.set(true);
        return;
      }
      await this.rpc.call('extractFrames', request);
      this.toastService.showToast({
        content: `Added frame ${frame} to the labeling queue.`,
      });
    } catch (err) {
      const detail = (err as { error?: { detail?: string } })?.error?.detail;
      if (typeof detail === 'string' && detail.includes('already in the label file')) {
        this.duplicateFrameOpen.set(true);
        return;
      }
      this.toastService.showToast({
        content:
          typeof detail === 'string' && detail ? detail : 'Could not add this frame.',
        variant: 'error',
      });
    } finally {
      this.isExtractFramesLoading.set(false);
    }
  }
  private viewerCenterPanel = viewChild<ViewerCenterPanelComponent>(
    ViewerCenterPanelComponent,
  );
  private toExtractFramesRequest(): ExtractFramesRequest {
    const labelFile = this.sessionService
      .allLabelFiles()
      .find((mvf) => mvf.key === this.extractFramesLabelFileKey())!;

    const session = this.sessionService
      .allSessions()
      .find((s) => s.key === this._sessionKey())!;
    return {
      projectKey: this.projectInfoService['projectContext']()?.key as string,
      labelFileCreationRequest: null,
      session: {
        views: session.views,
      },
      labelFile: {
        views: labelFile.views,
      },
      method: 'manual',
      manualFrameOptions: {
        frame_index_list: [this.videoPlayerState.currentFrameSignal()],
        predictions:
          this.enabledViewsKeypoints.modelsShown().length > 0
            ? this.viewerCenterPanel()!.getPredictionsForFrameExtraction(
                // Uses the first model for simplicity.
                this.enabledViewsKeypoints.modelsShown()[0],
              )
            : undefined,
      },
    };
  }
}

/** Width of the playback bar when the seek slider is as narrow as it can be. */
function measuredPlaybackBarMin(controls: HTMLElement): number {
  const style = getComputedStyle(controls);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  const items = [...controls.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  return playbackBarMinWidth(
    items.map((item) => item.getBoundingClientRect().width),
    items.findIndex((item) => item.classList.contains('seek-range')),
    gap,
    padding,
  );
}
