import { TestBed } from '@angular/core/testing';
import { ProjectInfoService } from './project-info.service';
import { RpcService } from './rpc.service';

describe('ProjectInfoService allViews', () => {
  let service: ProjectInfoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: RpcService, useValue: {} }],
    });
    service = TestBed.inject(ProjectInfoService);
  });

  it('is the project views, without the "unknown" placeholder', () => {
    service.setAllViews(['top', 'bot']);
    expect(service.allViews()).toEqual(['top', 'bot']);
  });

  it('is empty for a single-view project', () => {
    service.setAllViews([]);
    expect(service.allViews()).toEqual([]);
  });
});
