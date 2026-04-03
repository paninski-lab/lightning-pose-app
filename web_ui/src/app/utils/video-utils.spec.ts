import { TestBed } from '@angular/core/testing';
import { FineVideoService } from './fine-video.service';
import { ProjectInfoService } from '../project-info.service';

describe('VideoUtils', () => {
  let service: FineVideoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FineVideoService,
        { provide: ProjectInfoService, useValue: {} },
      ],
    });
    service = TestBed.inject(FineVideoService);
  });

  it('should create an instance', () => {
    expect(service).toBeTruthy();
  });
});
