import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  Signal,
  signal,
} from '@angular/core';
import { Session } from '../../session.model';
import { SessionService } from '../../session.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { toSignal } from '@angular/core/rxjs-interop';
import { FineVideoService } from '../../utils/fine-video.service';

@Component({
  selector: 'app-sessions-panel',
  imports: [RouterLink, RouterLinkActive, MatListModule, ScrollingModule],
  templateUrl: './viewer-sessions-panel.component.html',
  styleUrl: './viewer-sessions-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerSessionsPanelComponent {
  protected sessionService = inject(SessionService);
  protected fineVideoService = inject(FineVideoService);
}
