import { TestBed } from '@angular/core/testing';

import { RpcService } from './rpc.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('RpcService', () => {
  let service: RpcService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RpcService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
