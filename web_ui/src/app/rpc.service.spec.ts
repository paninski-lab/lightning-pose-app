import { TestBed } from '@angular/core/testing';

import { RpcService } from './rpc.service';

describe('RpcService', () => {
  let service: RpcService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RpcService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
