import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BundleAdjustDialogComponent } from './bundle-adjust-dialog.component';
import { RpcService } from '../rpc.service';
import { ProjectInfoService } from '../project-info.service';
import { of } from 'rxjs';
import hljs from 'highlight.js/lib/core';
import toml from 'highlight.js/lib/languages/ini';

// app.config.ts registers this for the app; the dialog shows TOML after a run.
hljs.registerLanguage('toml', toml);

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

  it('names the backup file after a run', () => {
    component['baResponse'].set({
      camList: ['top', 'side'],
      oldReprojectionError: [1, 2],
      newReprojectionError: [0.5, 1],
      oldCgDicts: [],
      newCgDicts: [],
      oldCgToml: '',
      newCgToml: '',
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement.textContent as string).replace(
      /\s+/g,
      ' ',
    );
    expect(text).toContain(
      'The old calibration will be backed up to calibrations/backups/SESSION.DATETIME.toml.',
    );
  });
});
