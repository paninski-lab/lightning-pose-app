import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectInfoService, ListProjectItem } from '../project-info.service';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent implements OnInit {
  private projectInfo = inject(ProjectInfoService);

  // View model with derived name for display
  protected projectsVm = computed(() => {
    const items = this.projectInfo.projects();
    if (!items) return undefined;
    return items.map((p) => ({
      ...p,
      name: deriveProjectName(p),
    }));
  });

  ngOnInit() {
    // Fetch only once per app load (idempotent if already set)
    if (!this.projectInfo.projects()) {
      void this.projectInfo.fetchProjects();
    }
  }
}

function deriveProjectName(p: ListProjectItem): string {
  // Prefer the last folder name of data_dir as a human-friendly name
  const parts = p.data_dir.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p.data_dir;
}
