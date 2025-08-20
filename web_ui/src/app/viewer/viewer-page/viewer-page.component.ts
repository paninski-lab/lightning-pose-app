import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  OnInit,
  signal,
} from '@angular/core';
import { ViewerSessionsPanelComponent } from '../viewer-left-panel/viewer-sessions-panel.component';
import { ViewSettings } from '../../view-settings.model';
import { VideoPlayerState } from '../../components/video-player/video-player-state';
import { ViewerCenterPanelComponent } from '../viewer-center-panel/viewer-center-panel.component';
import { ProjectInfoService } from '../../project-info.service';
import { SelectionModel } from '@angular/cdk/collections';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionService } from '../../session.service';
import { LoadingBarComponent } from '../../loading-bar/loading-bar.component';
import { LoadingService } from '../../loading.service';
import { FineVideoService } from '../../utils/fine-video.service';
import { Session } from '../../session.model';
import { Router } from '@angular/router';

@Component({
  selector: 'app-viewer',
  imports: [
    ViewerSessionsPanelComponent,
    ViewerCenterPanelComponent,
    LoadingBarComponent,
  ],
  templateUrl: './viewer-page.component.html',
  styleUrl: './viewer-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VideoPlayerState, ViewSettings],
})
export class ViewerPageComponent implements OnInit {
  viewSettings = inject(ViewSettings);
  projectInfoService = inject(ProjectInfoService);
  sessionService = inject(SessionService);
  loadingService = inject(LoadingService);

  protected keypointSelectionModel: SelectionModel<string>;
  protected viewSelectionModel: SelectionModel<string>;
  protected allViews = [] as string[];
  private router = inject(Router);

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
  async ngOnInit() {
    // Page inits by loading project info, and if it does not exist,
    // it will (future) open a dialog to get the project info.

    this.loadingService.isLoading.set(true);
    this.loadingService.maxProgress.set(2);
    this.loadingService.progress.set(0);

    // Load sessions and prediction index, but don't wait, just fire off the request.
    const p = this.sessionService.loadPredictionIndex();
    const s = this.sessionService.loadSessions().then(() => {
      this.loadingService.progress.update((x) => x + 1);
    });

    this.allViews = this.projectInfoService.allViews();
    p.then(() => {
      this.keypointSelectionModel.select(
        ...this.projectInfoService.allKeypoints(),
      );
      this.loadingService.progress.update((x) => x + 1);
    });

    Promise.allSettled([p, s]).then(() => {
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
        this.viewSettings.setViewsShown(this.viewSelectionModel.selected);
      });

    // Propagate changes from viewSettings store to our selection model.
    this.viewSettings.viewsShown$
      .pipe(takeUntilDestroyed())
      .subscribe((viewsShown) => {
        this.viewSelectionModel.setSelection(...viewsShown);
      });

    this.keypointSelectionModel.changed
      .asObservable()
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.viewSettings.setKeypointsShown(
          this.keypointSelectionModel.selected,
        );
      });
    this.viewSettings.keypointsShown$
      .pipe(takeUntilDestroyed())
      .subscribe((keypointsShown) => {
        this.keypointSelectionModel.setSelection(...keypointsShown);
      });
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
  protected fineVideoService = inject(FineVideoService);

  protected onModelDropdownItemClick(index: number, event: Event) {
    const selectEl = event.target as HTMLSelectElement;
    const modelKey = selectEl.value;
    const modelsShown = [...this.viewSettings.modelsShown()];
    if (modelKey === this.noneOption) {
      // Remove the model.
      modelsShown.splice(index, 1);
    } else {
      modelsShown[index] = modelKey;
    }

    this.viewSettings.setModelsShown(modelsShown);
  }

  protected handleSelectedSessionChange(session: Session | null) {
    if (session === null) {
      this.router.navigate(['/viewer']);
    } else {
      this.router.navigate(['/viewer', session.key]);
    }
  }
}
