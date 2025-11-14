import {
  ChangeDetectionStrategy,
  Component,
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

  // Whether the required initial setup has been done.
  // (Setting data directory, model directory, views).
  protected projectInfoRequestCompleted = signal(false);
  protected hasBeenSetup = signal(true);
  protected settingsDialog = viewChild.required<ElementRef>('settingsDialog');

  settingsDialogOpen = signal(false);

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
