import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProjectSettingsComponent } from './project-settings/project-settings.component';
import { ProjectInfoService } from './project-info.service';
import { FineVideoService } from './utils/fine-video.service';

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
  projectInfoService = inject(ProjectInfoService);
  protected fineVideoService = inject(FineVideoService);

  // Whether the required initial setup has been done.
  // (Setting data directory, model directory, views).
  protected projectInfoRequestCompleted = signal(false);
  protected hasBeenSetup = signal(false);
  protected settingsDialog = viewChild.required<ElementRef>('settingsDialog');

  settingsDialogOpen = signal(false);

  async ngOnInit() {
    await this.projectInfoService.loadProjectInfo();
    this.hasBeenSetup.set(Boolean(this.projectInfoService.projectInfo));
    this.projectInfoRequestCompleted.set(true);
  }

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
