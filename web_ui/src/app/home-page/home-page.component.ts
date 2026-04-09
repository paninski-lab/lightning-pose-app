import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListProjectItem, ProjectInfoService } from '../project-info.service';
import { ProjectDeleteDialogComponent } from './project-delete-dialog/project-delete-dialog.component';
import { UpdateProjectPathsDialogComponent } from '../update-project-paths-dialog/update-project-paths-dialog.component';
import { AddExistingProjectDialogComponent } from '../add-existing-project-dialog/add-existing-project-dialog.component';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../components/dropdown/dropdown.component';
import { PathDisplayComponent } from '../components/path-display/path-display.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    RouterLink,
    ProjectDeleteDialogComponent,
    UpdateProjectPathsDialogComponent,
    AddExistingProjectDialogComponent,
    DropdownComponent,
    DropdownTriggerDirective,
    DropdownTriggerComponent,
    DropdownContentComponent,
    PathDisplayComponent,
  ],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent implements OnInit {
  protected projectInfo = inject(ProjectInfoService);
  protected projectToDelete = signal<ListProjectItem | null>(null);
  protected projectToUpdatePaths = signal<ListProjectItem | null>(null);
  protected showAddExistingDialog = signal(false);

  protected alert(message: string) {
    alert(message);
  }

  ngOnInit() {
    // Fetch only once per app load (idempotent if already set)
    if (!this.projectInfo.projects()) {
      void this.projectInfo.fetchProjects();
    }
  }
}
