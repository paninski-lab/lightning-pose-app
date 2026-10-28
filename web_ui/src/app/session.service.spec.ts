import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';

import { SessionService } from './session.service';
import { ProjectInfoService } from './project-info.service';
import { RpcService } from './rpc.service';

describe('SessionService session/view grouping', () => {
  let service: SessionService;
  let rpcPaths: string[];

  function setUp(views: string[]) {
    const projectInfo = {
      projectInfo: {
        data_dir: '/data',
        model_dir: '/models',
        views,
        keypoint_names: ['nose'],
        ignored_video_dirs: [],
      },
      projectContext: () => ({ key: 'p' }),
      allViews: () => views,
      _allViews: new BehaviorSubject(views),
      setAllModels: jasmine.createSpy('setAllModels'),
      setAllKeypoints: jasmine.createSpy('setAllKeypoints'),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProjectInfoService, useValue: projectInfo },
        {
          provide: RpcService,
          useValue: {
            call: async () => ({
              entries: rpcPaths.map((path) => ({ path })),
            }),
          },
        },
      ],
    });
    service = TestBed.inject(SessionService);
  }

  async function sessions() {
    await service.loadSessions();
    return service
      .allSessions()
      .map((s) => ({ key: s.key, views: s.views.map((v) => v.viewName) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  it('keeps cam1 and cam10 as separate views of one session', async () => {
    setUp(['cam1', 'cam10']);
    rpcPaths = ['videos/trial_cam1.mp4', 'videos/trial_cam10.mp4'];
    expect(await sessions()).toEqual([
      { key: 'trial_*', views: ['cam1', 'cam10'] },
    ]);
  });

  it('groups stop_top and stop_side into session stop', async () => {
    setUp(['top', 'side']);
    rpcPaths = ['videos/stop_top.mp4', 'videos/stop_side.mp4'];
    expect(await sessions()).toEqual([
      { key: 'stop_*', views: ['top', 'side'] },
    ]);
  });

  it('lists a file whose last part is not a view on its own, as unknown', async () => {
    setUp(['top', 'side']);
    rpcPaths = ['videos/mouse1_top.mp4', 'videos/mouse1_back.mp4'];
    expect(await sessions()).toEqual([
      { key: 'mouse1_*', views: ['top'] },
      { key: 'mouse1_back', views: ['unknown'] },
    ]);
  });

  it('files prediction CSVs under the same session keys', async () => {
    setUp(['top', 'side']);
    rpcPaths = [
      'm1/video_preds/stop_top.csv',
      'm1/video_preds/stop_side.csv',
      'm1/video_preds/trial_cam10.csv',
    ];
    spyOn(
      service as unknown as { initKeypoints: () => Promise<void> },
      'initKeypoints',
    ).and.resolveTo();
    await service.loadPredictionIndex();
    expect(
      service.getPredictionFilesForSession('stop_*').map((p) => p.viewName),
    ).toEqual(['top', 'side']);
    expect(
      service
        .getPredictionFilesForSession('trial_cam10')
        .map((p) => p.viewName),
    ).toEqual(['unknown']);
  });
});
