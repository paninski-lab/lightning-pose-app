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
        link: ['/'],
        title: 'Project settings',
        description: 'View and edit configuration for the current Project',
        imgSrc: 'https://img.daisyui.com/images/components/accordion.webp',
        imgAlt: 'Accordion',
      },
      {
        link: [...base, 'labeler'],
        title: 'Labeler',
        description: 'View labeled data and label new frames',
        imgSrc: 'https://img.daisyui.com/images/components/accordion.webp',
        imgAlt: 'Accordion',
      },
      {
        link: [...base, 'models'],
        title: 'Models',
        description: 'Train, evaluate, and run models',
        imgSrc: 'https://img.daisyui.com/images/components/accordion.webp',
        imgAlt: 'Accordion',
      },
      {
        link: [...base, 'viewer'],
        title: 'Viewer',
        description: 'View sessions and model predictions',
        imgSrc: 'https://img.daisyui.com/images/components/accordion.webp',
        imgAlt: 'Accordion',
      },
    ];
  });
}
