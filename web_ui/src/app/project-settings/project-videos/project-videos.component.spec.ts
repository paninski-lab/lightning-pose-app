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
            call: async () => ({ entries: [], relativeTo: '/data' }),
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
});
