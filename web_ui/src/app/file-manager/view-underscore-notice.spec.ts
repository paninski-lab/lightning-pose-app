import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';

import { LabeledDataPanelComponent } from './labeled-data-panel.component';
import { ProjectVideosComponent } from './project-videos/project-videos.component';
import { ProjectInfoService } from '../project-info.service';
import { RpcService } from '../rpc.service';
import { SessionService } from '../session.service';
import { ToastService } from '../toast.service';

/** Both File Manager panels that list files by view say why a view with _ matches nothing. */
describe('File Manager notice for a view name with _', () => {
  function render(component: Type<unknown>, views: string[]): HTMLElement {
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        {
          provide: ProjectInfoService,
          useValue: {
            projectContext: () => ({
              key: 'demo',
              projectInfo: {
                data_dir: '/data',
                model_dir: '/models',
                views,
                keypoint_names: [],
              },
            }),
            globalContext: () => ({ homeDir: '/home' }),
          },
        },
        {
          provide: RpcService,
          useValue: {
            call: async () => ({ entries: [], relativeTo: '/data' }),
          },
        },
        { provide: SessionService, useValue: {} },
        { provide: ToastService, useValue: { showToast: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const notice = (el: HTMLElement) =>
    el.querySelector('[data-testid="view-underscore-notice"]');

  for (const [name, component] of [
    ['Videos', ProjectVideosComponent],
    ['Labeled Image Folders', LabeledDataPanelComponent],
  ] as const) {
    it(`${name}: names the view and says files show as Unknown view`, () => {
      const el = render(component, ['cam_top', 'side']);
      expect(notice(el)?.getAttribute('role')).toBe('alert');
      expect(notice(el)?.textContent?.trim()).toBe(
        "View names can't contain _ (cam_top), because video and folder names " +
          'are split at the last _. Use - instead (for example cam-top). ' +
          'Files for those views show as Unknown view until the views are ' +
          'renamed in Project settings.',
      );
    });

    it(`${name}: shows nothing when no view has _`, () => {
      expect(notice(render(component, ['top', 'side']))).toBeNull();
    });
  }
});
