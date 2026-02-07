import { TestBed } from '@angular/core/testing';

import LabelFileFetcherService from './label-file-fetcher.service';

describe('LabelFileFetcherService', () => {
  let service: LabelFileFetcherService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LabelFileFetcherService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
