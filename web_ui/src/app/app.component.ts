import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProjectSettingsComponent } from './project-settings/project-settings.component';
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
export class AppComponent implements OnInit {
  projectInfoService = inject(ProjectInfoService);

  protected isIniting = signal(false);
  protected settingsDialog = viewChild<ElementRef | undefined>(
    'settingsDialog',
  );

  async ngOnInit() {
    await this.projectInfoService.loadProjectInfo();
    this.isIniting.set(true);
  }

  protected openSettingsDialog() {
    const elementRef = this.settingsDialog();
    if (!elementRef) return; // projectinfo not yet loaded.
    (elementRef.nativeElement as HTMLDialogElement).showModal();
  }
}
