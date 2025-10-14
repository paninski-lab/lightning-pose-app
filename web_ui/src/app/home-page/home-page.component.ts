import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home-page',
  imports: [],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  cards = [
    {
      href: '/',
      title: 'Project settings',
      description: 'View and edit configuration for the current Project',
      imgSrc: 'https://img.daisyui.com/images/components/accordion.webp',
      imgAlt: 'Accordion',
    },
    {
      href: '/labeler',
      title: 'Labeler',
      description: 'View labeled data and label new frames',
      imgSrc: 'https://img.daisyui.com/images/components/accordion.webp',
      imgAlt: 'Accordion',
    },
    {
      href: '/models',
      title: 'Models',
      description: 'Train, evaluate, and run models',
      imgSrc: 'https://img.daisyui.com/images/components/accordion.webp',
      imgAlt: 'Accordion',
    },
    {
      href: '/viewer/',
      title: 'Viewer',
      description: 'View sessions and model predictions',
      imgSrc: 'https://img.daisyui.com/images/components/accordion.webp',
      imgAlt: 'Accordion',
    },
  ];
}
