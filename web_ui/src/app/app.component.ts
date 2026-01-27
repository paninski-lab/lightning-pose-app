import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { ProjectSettingsComponent } from './project-settings/project-settings.component';

import { ProjectInfoService } from './project-info.service';
import { LoadingService } from './loading.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ProjectSettingsComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  protected loadingService = inject(LoadingService);
  protected projectInfoService = inject(ProjectInfoService);

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  protected settingsDialog = viewChild.required<ElementRef>('settingsDialog');

  settingsDialogOpen = signal(false);
  protected settingsSetupMode = signal(false);
  protected settingsProjectKey = signal<string | null>(null);

  projectKey = computed(
    () => this.projectInfoService.projectContext()?.key ?? null,
  );
  navLinks = computed(() => {
    const key = this.projectKey();
    if (!key) {
      return [] as { link: unknown[]; text: string }[];
    }
    return [
      { link: ['/project', key, 'labeler'] as unknown[], text: 'Labeler' },
      { link: ['/project', key, 'models'] as unknown[], text: 'Models' },
      { link: ['/project', key, 'viewer'] as unknown[], text: 'Viewer' },
    ];
  });

  private _isCompatibleBrowser: boolean | null = null;
  protected get isCompatibleBrowser(): boolean {
    if (this._isCompatibleBrowser === null) {
      // @ts-expect-error TS2551
      if (navigator.userAgentData) {
        // @ts-expect-error TS2551
        const brands = navigator.userAgentData.brands;

        // Check specifically for Microsoft Edge
        const isEdge = brands.some(
          (b: { brand: string }) => b.brand === 'Microsoft Edge',
        );

        // Check for the Chromium engine in general (includes Chrome, Edge, Brave, etc.)
        const isChromium = brands.some(
          (b: { brand: string }) => b.brand === 'Chromium',
        );

        this._isCompatibleBrowser = isEdge || isChromium;
      } else {
        this._isCompatibleBrowser = false;
      }
    }
    return this._isCompatibleBrowser!;
  }

  constructor() {
    effect(() => {
      if (this.settingsDialogOpen()) {
        this.openSettingsDialog();
      } else {
        // Only close if the dialog is actually open, preventing early navigation override
        if (this.settingsDialog().nativeElement.open) {
          this.closeSettingsDialog();
        }
      }
    });
  }

  ngOnInit(): void {
    // Open dialog using query params.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        let routeSnapshot: ActivatedRouteSnapshot =
          this.router.routerState.snapshot.root;
        while (routeSnapshot.firstChild) {
          routeSnapshot = routeSnapshot.firstChild;
        }
        const params = routeSnapshot.queryParams;

        const settingsOpenParam = params['settingsOpen'];
        const createProjectKeyParam = params['createProject'];

        const currentProjectKey = this.projectKey();

        if (settingsOpenParam === 'true' && currentProjectKey) {
          this.settingsSetupMode.set(false);
          this.settingsProjectKey.set(currentProjectKey);
          this.settingsDialogOpen.set(true);
        } else if (createProjectKeyParam) {
          this.settingsSetupMode.set(true);
          this.settingsDialogOpen.set(true);
        } else {
          this.settingsDialogOpen.set(false);
        }
      });
  }

  private openSettingsDialog() {
    const elementRef = this.settingsDialog();
    (elementRef.nativeElement as HTMLDialogElement).showModal();
  }

  protected closeSettingsDialog() {
    const elementRef = this.settingsDialog();
    (elementRef.nativeElement as HTMLDialogElement).close();
    let deepestRoute = this.route;
    while (deepestRoute.firstChild) {
      deepestRoute = deepestRoute.firstChild;
    }
    this.router.navigate([], {
      queryParams: { settingsOpen: null, createProject: null },
      queryParamsHandling: 'merge',
      relativeTo: deepestRoute,
    });
  }

  handleSettingsDialogDoneCreation(createdProjectKey: string) {
    this.router.navigate(['/project', createdProjectKey]);
  }
}
