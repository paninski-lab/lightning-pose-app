import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectSettingsComponent } from './project-settings.component';
import { ProjectInfoService } from '../project-info.service';

describe('ProjectSettingsComponent', () => {
  let component: ProjectSettingsComponent;
  let fixture: ComponentFixture<ProjectSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectSettingsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectSettingsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('setupMode', true);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('disables save when exactly one camera view is entered', () => {
    const multiviewTab = [...fixture.nativeElement.querySelectorAll('a')].find(
      (el: HTMLElement) => el.textContent?.includes('Multiview'),
    );
    multiviewTab.click();

    const views = component['multiviewForm'].controls['views'];
    views.setValue('front');
    views.markAsDirty();
    fixture.detectChanges();

    const save = fixture.nativeElement.querySelector(
      '[data-testid="create-project-save"]',
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'at least two camera views',
    );

    views.setValue('front\nside');
    fixture.detectChanges();
    expect(save.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain(
      'at least two camera views',
    );
  });
});

describe('ProjectSettingsComponent view and keypoint name checks', () => {
  function open(setupMode: boolean) {
    const projectInfoService = {
      globalContext: () => ({ homeDir: '/home' }),
      projectInfo: {
        data_dir: '/data',
        model_dir: '/data/models',
        views: ['front', 'side'],
        keypoint_names: ['nose'],
        skeleton: [],
      },
      projectContext: () => null,
      reloadProjectInfo: async () => ({ skeleton: [] }),
    };
    TestBed.configureTestingModule({
      imports: [ProjectSettingsComponent],
      providers: [
        { provide: ProjectInfoService, useValue: projectInfoService },
      ],
    });
    const fixture = TestBed.createComponent(ProjectSettingsComponent);
    fixture.componentRef.setInput('setupMode', setupMode);
    if (!setupMode) fixture.componentRef.setInput('projectKey', 'demo');
    fixture.detectChanges();
    return fixture;
  }

  function showTab(
    fixture: ComponentFixture<ProjectSettingsComponent>,
    name: string,
  ) {
    const tab = [...fixture.nativeElement.querySelectorAll('a')].find(
      (el: HTMLElement) => el.textContent?.includes(name),
    );
    tab.click();
    fixture.detectChanges();
  }

  function setViews(
    fixture: ComponentFixture<ProjectSettingsComponent>,
    text: string,
  ) {
    const views = fixture.componentInstance['multiviewForm'].controls['views'];
    views.setValue(text);
    views.markAsDirty();
    fixture.detectChanges();
  }

  const byTestId = (
    fixture: ComponentFixture<ProjectSettingsComponent>,
    id: string,
  ): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  const UNDERSCORE =
    "View names can't contain _ (cam_top), because video and folder names " +
    'are split at the last _. Use - instead (for example cam-top).';

  it('refuses a new project with cam_top and says why', () => {
    const fixture = open(true);
    showTab(fixture, 'Multiview');
    setViews(fixture, 'cam_top\ncam-side');
    const message = byTestId(fixture, 'view-underscore-message')!;
    expect(message.textContent!.trim()).toBe(UNDERSCORE);
    expect(message.classList).toContain('text-error');
    const save = byTestId(fixture, 'create-project-save') as HTMLButtonElement;
    expect(save.disabled).toBeTrue();

    setViews(fixture, 'cam-top\ncam-side');
    expect(byTestId(fixture, 'view-underscore-message')).toBeNull();
    expect(save.disabled).toBeFalse();
  });

  it('warns about cam_top on an existing project but still allows Save', () => {
    const fixture = open(false);
    showTab(fixture, 'Multiview');
    setViews(fixture, 'cam_top\nside');
    const message = byTestId(fixture, 'view-underscore-message')!;
    expect(message.textContent!.trim()).toBe(UNDERSCORE);
    expect(message.classList).toContain('text-warning');
    const save = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.trim() === 'Save',
    ) as HTMLButtonElement;
    expect(save.disabled).toBeFalse();
  });

  it('warns about view names that differ only in letter case', () => {
    const fixture = open(true);
    showTab(fixture, 'Multiview');
    setViews(fixture, 'Top\ntop');
    expect(byTestId(fixture, 'view-case-message')!.textContent!.trim()).toBe(
      'View names Top and top differ only in letter case. ' +
        'They name the same file on macOS and Windows.',
    );
  });

  it('warns about keypoint names that differ only in letter case', () => {
    const fixture = open(true);
    showTab(fixture, 'Keypoints');
    const keypoints =
      fixture.componentInstance['keypointsForm'].controls['keypointNames'];
    keypoints.setValue('Nose\nnose\ntail');
    fixture.detectChanges();
    expect(
      byTestId(fixture, 'keypoint-case-message')!.textContent!.trim(),
    ).toBe('Keypoint names Nose and nose differ only in letter case.');
  });
});
