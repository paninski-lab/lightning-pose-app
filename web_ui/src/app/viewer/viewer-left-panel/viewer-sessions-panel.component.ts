import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionService } from '../../session.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { FineVideoService } from '../../utils/fine-video.service';
import { ViewSettings } from '../../view-settings.model';
import { ProjectInfoService } from '../../project-info.service';
import { PathPipe } from '../../components/path.pipe';

@Component({
  selector: 'app-sessions-panel',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatListModule,
    ScrollingModule,
    PathPipe,
  ],
  templateUrl: './viewer-sessions-panel.component.html',
  styleUrl: './viewer-sessions-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerSessionsPanelComponent {
  protected sessionService = inject(SessionService);
  private projectInfoService = inject(ProjectInfoService);
  protected fineVideoService = inject(FineVideoService);
  private viewSettings = inject(ViewSettings);

  protected sessionHasModel1(sessionKey: string): boolean {
    this.projectInfoService.allModels(); // hack: track dependency to trigger
    // re-evaluation when models load.
    const model = this.viewSettings.modelsShown()[0];
    const availableModels =
      this.sessionService.getAvailableModelsForSession(sessionKey);
    if (!model) return availableModels.length > 0;
    return availableModels.includes(model);
  }

  protected sessionHasModel2(sessionKey: string): boolean {
    const model = this.viewSettings.modelsShown()[1];
    if (!model) return false;
    const availableModels =
      this.sessionService.getAvailableModelsForSession(sessionKey);
    return availableModels.includes(model);
  }
}
