import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProjectSettingsComponent } from './project-settings/project-settings.component';
import { FineVideoService } from './utils/fine-video.service';
import { LoadingService } from './loading.service';
import { ProjectInfoService } from './project-info.service';

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
export class AppComponent {
  protected fineVideoService = inject(FineVideoService);
  protected loadingService = inject(LoadingService);
  protected projectInfoService = inject(ProjectInfoService);

  // Whether the required initial setup has been done.
  // (Setting data directory, model directory, views).
  protected projectInfoRequestCompleted = signal(false);
  protected hasBeenSetup = signal(true);
  protected settingsDialog = viewChild.required<ElementRef>('settingsDialog');

  settingsDialogOpen = signal(false);

  // Navbar computed state
  projectKey = computed(() => this.projectInfoService.projectContext()?.key ?? null);
  projectName = computed(() => {
    const ctx = this.projectInfoService.projectContext();
    const key = ctx?.key ?? null;
    const dataDir = ctx?.projectInfo?.data_dir ?? null;
    if (dataDir) {
      const parts = String(dataDir).split('/').filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : key;
    }
    return key;
  });
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

  constructor() {
    effect(() => {
      if (this.settingsDialogOpen()) {
        this.openSettingsDialog();
      } else {
        this.closeSettingsDialog();
      }
    });
  }

  private openSettingsDialog() {
    const elementRef = this.settingsDialog();
    (elementRef.nativeElement as HTMLDialogElement).showModal();
  }

  private closeSettingsDialog() {
    const elementRef = this.settingsDialog();
    (elementRef.nativeElement as HTMLDialogElement).close();
  }
}
