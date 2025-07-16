import {
  CanActivateFn,
  RedirectCommand,
  Router,
  Routes,
} from '@angular/router';
import { ViewerPageComponent } from './viewer/viewer-page/viewer-page.component';
import { LabelerPageComponent } from './labeler/labeler-page.component';
import { ProjectInfoService } from './project-info.service';
import { inject } from '@angular/core';

export const routes: Routes = [
  {
    path: 'viewer',
    component: ViewerPageComponent,
    title: 'Lightning Pose Viewer',
  },
  {
    path: 'viewer/:sessionKey',
    component: ViewerPageComponent,
    title: 'Lightning Pose Viewer',
  },
  {
    path: 'labeler',
    component: LabelerPageComponent,
    title: 'Lightning Pose Labeler',
  },
  {
    path: 'labeler/:labelFile',
    component: LabelerPageComponent,
    title: 'Lightning Pose Labeler',
  },
  {
    path: 'labeler/:labelFile/:frameKey',
    component: LabelerPageComponent,
    title: 'Lightning Pose Labeler',
  },
];
