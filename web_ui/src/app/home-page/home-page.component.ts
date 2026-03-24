import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectInfoService, ListProjectItem } from '../project-info.service';
import { ProjectDeleteDialogComponent } from './project-delete-dialog/project-delete-dialog.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink, ProjectDeleteDialogComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent implements OnInit {
  protected projectInfo = inject(ProjectInfoService);
  protected projectToDelete = signal<ListProjectItem | null>(null);

  ngOnInit() {
    // Fetch only once per app load (idempotent if already set)
    if (!this.projectInfo.projects()) {
      void this.projectInfo.fetchProjects();
    }
  }
}
