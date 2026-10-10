import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectVideosComponent } from './project-videos.component';
import { ProjectInfoService } from '../../project-info.service';
import { RpcService } from '../../rpc.service';
import { SessionService } from '../../session.service';
import { ToastService } from '../../toast.service';

describe('ProjectVideosComponent', () => {
  let component: ProjectVideosComponent;
  let fixture: ComponentFixture<ProjectVideosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectVideosComponent],
      providers: [
        {
          provide: ProjectInfoService,
          useValue: {
            projectContext: () => ({
              key: 'demo',
              projectInfo: {
                data_dir: '/data',
                model_dir: '/models',
                views: ['view'],
                keypoint_names: [],
              },
            }),
            globalContext: () => ({ homeDir: '/home' }),
          },
        },
        {
          provide: RpcService,
          useValue: {
            call: async () => ({
              entries: [
                {
                  path: 'videos-for-each-labeled-frame/session/clip.mp4',
                },
                { path: 'not-videos/session/clip.mp4' },
              ],
              relativeTo: '/data',
            }),
          },
        },
        { provide: SessionService, useValue: {} },
        { provide: ToastService, useValue: { showToast: () => undefined } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectVideosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('flags a multiview name without an underscore and accepts session_view.mp4', () => {
    expect(component.nameError('session.mp4')).toBe(
      'Filename must be of the form session_view.ext',
    );
    expect(component.nameError('session_view.mp4')).toBeNull();
  });

  it('keeps a nested mp4 under a videos* folder and shows its filename error', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('videos-for-each-labeled-frame');
    expect(text).toContain('session/clip.mp4');
    expect(text).not.toContain('not-videos');
    expect(text).toContain('Filename must be of the form session_view.ext');
    expect(text).not.toContain('Validate');
  });
});
