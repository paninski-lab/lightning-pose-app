import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';
import { ProjectInfoService } from '../project-info.service';
import { LabelerCenterPanelComponent } from './labeler-center-panel/labeler-center-panel.component';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-labeler',
  imports: [
    LoadingBarComponent,
    LabelerCenterPanelComponent,
    RouterLinkActive,
    RouterLink,
  ],
  templateUrl: './labeler-page.component.html',
  styleUrl: './labeler-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelerPageComponent implements OnInit {
  isIniting = signal(false);
  projectInfoService = inject(ProjectInfoService);
  sessionService = inject(SessionService);
  async ngOnInit() {
    await this.projectInfoService.loadProjectInfo();

    await this.sessionService.loadLabelFiles();
    this.isIniting.set(false);
  }
}
