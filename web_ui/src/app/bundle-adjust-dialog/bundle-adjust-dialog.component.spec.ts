import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BundleAdjustDialogComponent } from './bundle-adjust-dialog.component';
import { RpcService } from '../rpc.service';
import { ProjectInfoService } from '../project-info.service';
import { of } from 'rxjs';

describe('BundleAdjustDialogComponent', () => {
  let component: BundleAdjustDialogComponent;
  let fixture: ComponentFixture<BundleAdjustDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BundleAdjustDialogComponent],
      providers: [
        { provide: RpcService, useValue: { callObservable: () => of({}) } },
        {
          provide: ProjectInfoService,
          useValue: { projectContext: () => ({ key: 'test' }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BundleAdjustDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('labelFile', {});
    fixture.componentRef.setInput('frame', { key: 'a/b*/c/d', views: [] });
    fixture.componentRef.setInput('numLabeledFramesGetter', () => 0);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
