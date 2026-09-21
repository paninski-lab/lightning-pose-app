import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, output, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';

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
import { MVFrame } from './frame.model';

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
  hasNextFrame = input(false);
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

describe('LabelerPageComponent — handleSaved frame advance', () => {
  let component: LabelerPageComponent;
  let fixture: ComponentFixture<LabelerPageComponent>;
  let navigateSpy: jasmine.Spy;

  const labelFile: MVLabelFile = {
    key: 'CollectedData_camA',
    views: [{ viewName: 'camA', csvPath: 'CollectedData_camA.csv' }],
  };

  function makeFrame(key: string): MVFrame {
    const kp = { keypointName: 'nose', x: 1, y: 2 };
    return {
      key,
      views: [
        {
          viewName: 'camA',
          imgPath: `${key}.png`,
          keypoints: [{ ...kp }],
          originalKeypoints: [{ ...kp }],
        },
      ],
    };
  }

  beforeEach(async () => {
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
        {
          provide: ProjectInfoService,
          useValue: {
            projectContext: () => ({ key: 'proj' }),
            allViews: signal<string[]>([]),
            projectInfo: {
              views: [],
              data_dir: '',
              model_dir: '',
              keypoint_names: [],
            },
          },
        },
        {
          provide: SessionService,
          useValue: {
            loadLabelFiles: () => Promise.resolve(),
            allLabelFiles: signal([labelFile]),
            getDefaultLabelFile: () => null,
          },
        },
        { provide: ToastService, useValue: { showToast: () => {} } },
        {
          provide: LabelFileFetcherService,
          useValue: { loadLabelFileData: () => Promise.resolve([]) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LabelerPageComponent);
    component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);

    fixture.componentRef.setInput('labelFileKey', labelFile.key);
    fixture.detectChanges();
    await fixture.whenStable();

    (component as unknown as { isIniting: { set: (v: boolean) => void } }).isIniting.set(
      false,
    );
    (
      component as unknown as {
        loadedLabelFile: { set: (v: MVLabelFile) => void };
      }
    ).loadedLabelFile.set(labelFile);
  });

  function setFrames(frames: MVFrame[]) {
    (
      component as unknown as {
        labelFileData: { set: (v: MVFrame[]) => void };
      }
    ).labelFileData.set(frames);
  }

  function handleSaved(
    data: Parameters<LabelerPageComponent['handleSaved']>[0],
  ) {
    (
      component as unknown as {
        handleSaved: (d: typeof data) => void;
      }
    ).handleSaved(data);
  }

  it('advances from second-to-last frame to the last frame', () => {
    const frames = [makeFrame('f0'), makeFrame('f1'), makeFrame('f2')];
    setFrames(frames);
    fixture.componentRef.setInput('frameKey', 'f1');

    handleSaved({
      labelFile,
      frame: frames[1],
      shouldAdvanceFrame: true,
    });

    expect(navigateSpy).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { labelFileKey: labelFile.key, frameKey: 'f2' },
      }),
    );
  });

  it('does not navigate when already on the last frame', () => {
    const frames = [makeFrame('f0'), makeFrame('f1'), makeFrame('f2')];
    setFrames(frames);
    fixture.componentRef.setInput('frameKey', 'f2');

    handleSaved({
      labelFile,
      frame: frames[2],
      shouldAdvanceFrame: true,
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('navigates to the previous remaining frame when deleting the last frame', () => {
    const frames = [makeFrame('f0'), makeFrame('f1'), makeFrame('f2')];
    setFrames(frames);
    fixture.componentRef.setInput('frameKey', 'f2');

    handleSaved({
      labelFile,
      frame: frames[2],
      shouldAdvanceFrame: false,
      deletion: true,
    });

    expect(navigateSpy).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { labelFileKey: labelFile.key, frameKey: 'f1' },
      }),
    );
  });
});
