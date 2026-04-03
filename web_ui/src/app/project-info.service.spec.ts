import { TestBed } from '@angular/core/testing';

import { ProjectInfoService } from './project-info.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('ProjectInfoService', () => {
  let service: ProjectInfoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectInfoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
