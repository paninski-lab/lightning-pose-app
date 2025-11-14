import { ActivatedRouteSnapshot, ResolveFn, Routes } from '@angular/router';
import { ViewerPageComponent } from './viewer/viewer-page/viewer-page.component';
import { LabelerPageComponent } from './labeler/labeler-page.component';
import { SandboxComponent } from './sandbox/sandbox.component';
import { ProjectHomePageComponent } from './project-home-page/project-home-page.component';
import { ModelsPageComponent } from './models-page/models-page.component';
import {
  GlobalContext,
  ProjectContext,
  ProjectInfoService,
} from './project-info.service';
import { take } from 'rxjs/operators';
import { inject } from '@angular/core';

// Resolver functions kept close to their usage
export const globalContextResolver: ResolveFn<GlobalContext> = () => {
  const service = inject(ProjectInfoService);
  service.fetchGlobalContext();
  return service.globalLoaded$.pipe(take(1));
};

export const projectContextResolver: ResolveFn<ProjectContext> = (
  route: ActivatedRouteSnapshot,
) => {
  const service = inject(ProjectInfoService);
  const projectKey = route.paramMap.get('projectKey');
  if (!projectKey) {
    throw new Error('projectKey route param missing');
  }
  service.fetchProjectContext(projectKey);
  return service.projectLoaded$.pipe(take(1));
};

export const routes: Routes = [
  {
    path: '',
    component: ProjectHomePageComponent,
    title: 'Lightning Pose App',
    resolve: { globalContext: globalContextResolver },
  },
  {
    path: 'project/:projectKey',
    resolve: { projectContext: projectContextResolver },
    children: [
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
