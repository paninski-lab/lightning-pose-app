import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import LabelFileFetcherService from './label-file-fetcher.service';
import { ProjectInfoService } from '../project-info.service';

describe('LabelFileFetcherService', () => {
  let service: LabelFileFetcherService;
  let http: HttpTestingController;

  beforeEach(() => {
    const projectInfo = jasmine.createSpyObj(
      'ProjectInfoService',
      ['projectContext'],
      {
        projectInfo: { views: [], data_dir: 'data', keypoint_names: ['nose'] },
      },
    );
    projectInfo.projectContext.and.returnValue(null);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProjectInfoService, useValue: projectInfo },
      ],
    });
    service = TestBed.inject(LabelFileFetcherService);
    http = TestBed.inject(HttpTestingController);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('opens a queued frame written with \\ separators at its / path', async () => {
    const loaded = service.loadLabelFileData({
      key: 'CollectedData.csv',
      views: [{ viewName: 'unknown', csvPath: 'data/CollectedData.csv' }],
    });
    http
      .expectOne('/app/v0/files/data/CollectedData.csv')
      .flush(
        'scorer,s,s\nbodyparts,nose,nose\ncoords,x,y\n' +
          'labeled-data/sess/img00000001.png,1,2\n',
      );
    http.expectOne('/app/v0/files/data/CollectedData.unlabeled.jsonl').flush(
      JSON.stringify({
        frame_path: 'labeled-data\\sess\\img00000042.png',
        predictions: null,
      }) + '\n',
    );

    const frames = await loaded;
    expect(frames.map((f) => f.views[0].imgPath)).toEqual([
      'labeled-data/sess/img00000001.png',
      'labeled-data/sess/img00000042.png',
    ]);
  });
});
