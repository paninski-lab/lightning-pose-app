import { Routes } from '@angular/router';
import { ViewerPageComponent } from './viewer/viewer-page/viewer-page.component';
import { LabelerPageComponent } from './labeler/labeler-page.component';
import { SandboxComponent } from './sandbox/sandbox.component';

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
    path: 'labeler/:labelFileKey',
    component: LabelerPageComponent,
    title: 'Lightning Pose Labeler',
  },
  {
    path: 'labeler/:labelFileKey/:frameKey',
    component: LabelerPageComponent,
    title: 'Lightning Pose Labeler',
  },
  {
    path: 'sandbox',
    component: SandboxComponent,
    title: 'Sandbox',
  },
];
