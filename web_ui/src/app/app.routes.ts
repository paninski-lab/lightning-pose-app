import { ActivatedRouteSnapshot, ResolveFn, Routes } from '@angular/router';
import { ViewerPageComponent } from './viewer/viewer-page/viewer-page.component';
import { LabelerPageComponent } from './labeler/labeler-page.component';
import { SandboxComponent } from './sandbox/sandbox.component';
import { HomePageComponent } from './home-page/home-page.component';
import { ModelsPageComponent } from './models-page/models-page.component';
import { ProjectHomePageComponent } from './project-home-page/project-home-page.component';
import {
  GlobalContext,
  ProjectContext,
  ProjectInfoService,
} from './project-info.service';
import { inject } from '@angular/core';

export const contextResolver: ResolveFn<{
  projectContext: ProjectContext | null;
  globalContext: GlobalContext;
}> = (route: ActivatedRouteSnapshot) => {
  const service = inject(ProjectInfoService);
  const projectKey = route.paramMap.get('projectKey');

  return service.fetchContext(projectKey);
};

export const routes: Routes = [
  {
    path: '',
    component: HomePageComponent,
    title: 'Lightning Pose App',
    resolve: {
      context: contextResolver,
    },
  },
  {
    path: 'project/:projectKey',
    resolve: {
      context: contextResolver,
    },
    children: [
      {
        path: '',
        component: ProjectHomePageComponent,
        title: 'Project Home',
      },
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
        path: 'models',
        component: ModelsPageComponent,
        title: 'Lightning Pose Models',
      },
    ],
  },
  {
    path: 'sandbox',
    component: SandboxComponent,
    title: 'Sandbox',
  },
];
