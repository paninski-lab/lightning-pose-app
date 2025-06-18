import { TestBed } from '@angular/core/testing';

import { ProjectInfoService } from './project-info.service';

describe('ProjectInfoService', () => {
  let service: ProjectInfoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProjectInfoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
