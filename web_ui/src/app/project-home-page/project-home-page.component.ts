import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectInfoService } from '../project-info.service';

@Component({
  selector: 'app-project-home-page',
  imports: [RouterLink],
  templateUrl: './project-home-page.component.html',
  styleUrl: './project-home-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectHomePageComponent {
  private projectInfo = inject(ProjectInfoService);

  projectKey = computed(() => this.projectInfo.projectContext()?.key ?? null);

  cards = computed(() => {
    const key = this.projectKey();
    const base = ['/project', key] as const;
    return [
      {
        link: [],
        queryParams: { settingsOpen: 'true' },
        title: 'Project settings',
        description: 'View and edit configuration for the current Project',
        imgSrc: '/project_home_card_settings.jpg',
        imgAlt: 'Accordion',
      },
      {
        link: [...base, 'labeler'],
        queryParams: undefined,
        title: 'Labeler',
        description: 'View labeled data and label new frames',
        imgSrc: '/project_home_card_labeler.jpg',
        imgAlt: 'Accordion',
      },
      {
        link: [...base, 'models'],
        queryParams: undefined,
        title: 'Models',
        description: 'Train, evaluate, and run models',
        imgSrc: '/project_home_card_models.png',
        imgAlt: 'Accordion',
      },
      {
        link: [...base, 'viewer'],
        queryParams: undefined,
        title: 'Viewer',
        description: 'View sessions and model predictions',
        imgSrc: '/project_home_card_viewer.png',
        imgAlt: 'Accordion',
      },
    ];
  });
}
