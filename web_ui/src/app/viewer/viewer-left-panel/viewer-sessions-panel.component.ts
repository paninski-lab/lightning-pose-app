import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import { SessionService } from '../../session.service';
import { MatListModule } from '@angular/material/list';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ViewSettings } from '../../view-settings.model';
import { ProjectInfoService } from '../../project-info.service';
import { PathPipe } from '../../components/path.pipe';
import { Session } from '../../session.model';

@Component({
  selector: 'app-sessions-panel',
  imports: [MatListModule, ScrollingModule, PathPipe],
  templateUrl: './viewer-sessions-panel.component.html',
  styleUrl: './viewer-sessions-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerSessionsPanelComponent implements OnInit {
  protected sessionService = inject(SessionService);
  private projectInfoService = inject(ProjectInfoService);
  private viewSettings = inject(ViewSettings, { optional: true });

  showModelAvailableMarkers = input.required<boolean>();
  selectedSessionKey = input<string | null>();
  selectedSessionChange = output<Session | null>();

  ngOnInit() {
    this.sessionService.loadSessions();
  }

  protected sessionHasModel1(sessionKey: string): boolean {
    if (!this.showModelAvailableMarkers()) return false;
    this.projectInfoService.allModels(); // hack: track dependency to trigger
    // re-evaluation when models load.
    const model = this.viewSettings?.modelsShown()[0];
    const availableModels =
      this.sessionService.getAvailableModelsForSession(sessionKey);
    if (!model) return availableModels.length > 0;
    return availableModels.includes(model);
  }

  protected sessionHasModel2(sessionKey: string): boolean {
    if (!this.showModelAvailableMarkers()) return false;
    const model = this.viewSettings?.modelsShown()[1];
    if (!model) return false;
    const availableModels =
      this.sessionService.getAvailableModelsForSession(sessionKey);
    return availableModels.includes(model);
  }

  handleSessionSelect(session: Session) {
    this.selectedSessionChange.emit(session);
  }
}
