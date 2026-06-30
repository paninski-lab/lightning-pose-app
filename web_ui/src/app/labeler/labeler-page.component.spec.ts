import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, output, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { LabelerPageComponent } from './labeler-page.component';
import { ExtractFramesDialogComponent } from './extract-frames-dialog/extract-frames-dialog.component';
import { LabelerCenterPanelComponent } from './labeler-center-panel/labeler-center-panel.component';
import { LabelFilePickerComponent } from '../label-file-picker/label-file-picker.component';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';
import { ProjectInfoService } from '../project-info.service';
import { SessionService } from '../session.service';
import { ToastService } from '../toast.service';
import LabelFileFetcherService from './label-file-fetcher.service';
import { MVLabelFile } from '../label-file.model';

// Minimal stub that exposes the same inputs as the real component so we can
// inspect what the parent template binds to them.
@Component({ selector: 'app-extract-frames-dialog', template: '', standalone: true })
class StubExtractFramesDialogComponent {
  initialStep = input<string>('labelFile');
  initialLabelFileSelectionType = input<'createNew' | 'useExisting'>('createNew');
  initialSelectedLabelFileKey = input<string | null>(null);
  exit = output<void>();
  done = output<string>();
}

@Component({ selector: 'app-labeler-center-panel', template: '', standalone: true })
class StubLabelerCenterPanelComponent {
  labelFile = input<MVLabelFile | null>(null);
  frame = input<unknown>(null);
  numLabeledFramesGetter = input<unknown>(null);
  saved = output<unknown>();
  newLabelFile = output<void>();
}

@Component({ selector: 'app-label-file-picker', template: '', standalone: true })
class StubLabelFilePickerComponent {
  fullWidth = input<boolean>(false);
  labelFileKey = input<string | null>(null);
  size = input<string>('md');
  labelFileKeyChange = output<string | null>();
}

@Component({ selector: 'app-loading-bar', template: '', standalone: true })
class StubLoadingBarComponent {}

describe('LabelerPageComponent — extract-frames dialog initial step', () => {
  let component: LabelerPageComponent;
  let fixture: ComponentFixture<LabelerPageComponent>;
  let allLabelFilesSignal: ReturnType<typeof signal<MVLabelFile[]>>;

  beforeEach(async () => {
    allLabelFilesSignal = signal<MVLabelFile[]>([]);

    const mockSessionService = {
      loadLabelFiles: () => Promise.resolve(),
      allLabelFiles: allLabelFilesSignal,
      getDefaultLabelFile: () => null,
    };
    const mockProjectInfoService = {
      projectContext: () => null,
      allViews: signal<string[]>([]),
      projectInfo: { views: [], data_dir: '', model_dir: '', keypoint_names: [] },
    };

    TestBed.overrideComponent(LabelerPageComponent, {
      remove: {
        imports: [
          ExtractFramesDialogComponent,
          LabelerCenterPanelComponent,
          LabelFilePickerComponent,
          LoadingBarComponent,
        ],
      },
      add: {
        imports: [
          StubExtractFramesDialogComponent,
          StubLabelerCenterPanelComponent,
          StubLabelFilePickerComponent,
          StubLoadingBarComponent,
        ],
      },
    });

    await TestBed.configureTestingModule({
      imports: [LabelerPageComponent],
      providers: [
        provideRouter([]),
        { provide: ProjectInfoService, useValue: mockProjectInfoService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: ToastService, useValue: { showToast: () => {} } },
        {
          provide: LabelFileFetcherService,
          useValue: { loadLabelFileData: () => Promise.resolve([]) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LabelerPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function queryDialogStub(): StubExtractFramesDialogComponent {
    const el = fixture.debugElement.query(By.directive(StubExtractFramesDialogComponent));
    expect(el).withContext('app-extract-frames-dialog stub should be present').not.toBeNull();
    return el.componentInstance as StubExtractFramesDialogComponent;
  }

  it('passes initialStep="labelFile" and initialLabelFileSelectionType="createNew" when labelFileKey is null', () => {
    fixture.componentRef.setInput('labelFileKey', null);
    component.extractFramesDialogOpen.set(true);
    fixture.detectChanges();

    const stub = queryDialogStub();
    expect(stub.initialStep()).toBe('labelFile');
    expect(stub.initialLabelFileSelectionType()).toBe('createNew');
  });

  // Regression: == null was changed to === null, which caused undefined to fall
  // through to 'session'/'useExisting'. Angular router supplies undefined (not
  // null) when the query param is absent.
  it('passes initialStep="labelFile" and initialLabelFileSelectionType="createNew" when labelFileKey is undefined', () => {
    fixture.componentRef.setInput('labelFileKey', undefined);
    component.extractFramesDialogOpen.set(true);
    fixture.detectChanges();

    const stub = queryDialogStub();
    expect(stub.initialStep()).toBe('labelFile');
    expect(stub.initialLabelFileSelectionType()).toBe('createNew');
  });

  it('passes initialStep="session" and initialLabelFileSelectionType="useExisting" when labelFileKey is a string', () => {
    const labelFileKey = 'CollectedData_camA';
    allLabelFilesSignal.set([{ key: labelFileKey, views: [] }]);
    fixture.componentRef.setInput('labelFileKey', labelFileKey);
    component.extractFramesDialogOpen.set(true);
    fixture.detectChanges();

    const stub = queryDialogStub();
    expect(stub.initialStep()).toBe('session');
    expect(stub.initialLabelFileSelectionType()).toBe('useExisting');
  });
});
