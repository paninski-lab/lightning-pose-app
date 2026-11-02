import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CreateEksModelDialogComponent } from './create-eks-model-dialog.component';
import { ProjectInfoService } from '../project-info.service';
import { SessionService } from '../session.service';
import { ToastService } from '../toast.service';
import { CameraCalibrationService } from '../camera-calibration.service';
import { ModelListResponseEntry } from '../modelconf';

function makeModel(name: string): ModelListResponseEntry {
  return {
    model_name: name,
    model_relative_path: name,
    model_kind: 'normal',
    status: { status: 'COMPLETED' },
  } as ModelListResponseEntry;
}

describe('CreateEksModelDialogComponent', () => {
  let component: CreateEksModelDialogComponent;
  let fixture: ComponentFixture<CreateEksModelDialogComponent>;
  let mockSessionService: jasmine.SpyObj<SessionService>;

  async function setup(views: string[], hasCalibrations: boolean) {
    mockSessionService = jasmine.createSpyObj('SessionService', [
      'listModels',
      'createEksModel',
    ]);
    mockSessionService.listModels.and.returnValue(
      Promise.resolve({
        models: [
          makeModel('model_a'),
          makeModel('model_b'),
          makeModel('model_c'),
        ],
      }),
    );

    const mockProjectInfoService = {
      projectInfo: { views, keypoint_names: [], data_dir: '', model_dir: '' },
    };
    const mockCalibrationService = jasmine.createSpyObj(
      'CameraCalibrationService',
      ['projectHasCalibrations'],
    );
    mockCalibrationService.projectHasCalibrations.and.returnValue(
      Promise.resolve(hasCalibrations),
    );

    await TestBed.configureTestingModule({
      imports: [CreateEksModelDialogComponent],
      providers: [
        { provide: SessionService, useValue: mockSessionService },
        { provide: ProjectInfoService, useValue: mockProjectInfoService },
        { provide: CameraCalibrationService, useValue: mockCalibrationService },
        {
          provide: ToastService,
          useValue: jasmine.createSpyObj('ToastService', ['showToast']),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateEksModelDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function setFormState(modelName: string, memberPaths: string[]) {
    component['form'].controls.modelName.setValue(modelName);
    component['form'].controls.memberIds.setValue(memberPaths);
    fixture.detectChanges();
  }

  function getCreateButton(): HTMLButtonElement {
    const create = fixture.debugElement
      .queryAll(By.css('.modal-action button'))
      .find((el) => el.nativeElement.textContent?.trim() === 'Create');
    expect(create).withContext('Create button').toBeDefined();
    return create!.nativeElement;
  }

  function getSmootherRadio(value: 'linear' | 'nonlinear'): HTMLInputElement {
    return fixture.debugElement.query(
      By.css(
        `[role="radiogroup"][aria-label="Smoother"] input[value="${value}"]`,
      ),
    ).nativeElement;
  }

  /** Text beside the Nonlinear option (its reason tag when disabled). */
  function nonlinearLabelText(): string {
    return getSmootherRadio('nonlinear').closest('label')!.textContent ?? '';
  }

  describe('Create button disabled state', () => {
    beforeEach(() => setup(['top', 'bot'], true));

    it('is disabled when 0 models are selected', () => {
      setFormState('my_eks', []);
      expect(getCreateButton().classList).toContain('btn-disabled');
    });

    it('is enabled when 1 model is selected', () => {
      setFormState('my_eks', ['model_a']);
      expect(getCreateButton().classList).not.toContain('btn-disabled');
    });
  });

  describe('Odd number of members', () => {
    beforeEach(() => setup(['top', 'bot'], true));

    function clickMember(name: string) {
      const box = fixture.debugElement
        .queryAll(By.css('input[type="checkbox"]'))
        .find((el) =>
          el.nativeElement.closest('label')?.textContent?.includes(name),
        );
      expect(box).withContext(name).toBeDefined();
      box!.nativeElement.click();
      fixture.detectChanges();
    }

    function warning(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[role="status"]');
    }

    it('warns with an even number of members, without blocking Create', () => {
      component['form'].controls.modelName.setValue('my_eks');
      clickMember('model_a');
      expect(warning()).toBeNull();
      clickMember('model_b');
      expect(warning()).not.toBeNull();
      expect(getCreateButton().classList).not.toContain('btn-disabled');
      clickMember('model_c');
      expect(warning()).toBeNull();
    });
  });

  describe('Smoother choice', () => {
    it('single-view project: Linear only, Nonlinear says it needs multiview', async () => {
      await setup([], true);
      expect(getSmootherRadio('linear').checked).toBeTrue();
      expect(getSmootherRadio('nonlinear').disabled).toBeTrue();
      expect(nonlinearLabelText()).toContain('multiview');
    });

    it('multiview project without calibration: Nonlinear says it needs calibration', async () => {
      await setup(['top', 'bot'], false);
      expect(getSmootherRadio('nonlinear').disabled).toBeTrue();
      expect(nonlinearLabelText()).toContain('calibration');
    });

    it('single-view project creates a linear EKS model', async () => {
      await setup([], false);
      mockSessionService.createEksModel.and.returnValue(Promise.resolve());
      setFormState('my_eks', ['model_a']);
      getCreateButton().click();
      await fixture.whenStable();
      expect(mockSessionService.createEksModel).toHaveBeenCalledWith(
        jasmine.objectContaining({ view_names: [], smoother: 'linear' }),
      );
    });

    it('multiview project with calibration can create a nonlinear EKS model', async () => {
      await setup(['top', 'bot'], true);
      mockSessionService.createEksModel.and.returnValue(Promise.resolve());
      expect(getSmootherRadio('nonlinear').disabled).toBeFalse();
      setFormState('my_eks', ['model_a']);
      getSmootherRadio('nonlinear').click();
      fixture.detectChanges();
      getCreateButton().click();
      await fixture.whenStable();
      expect(mockSessionService.createEksModel).toHaveBeenCalledWith(
        jasmine.objectContaining({
          view_names: ['top', 'bot'],
          smoother: 'nonlinear',
        }),
      );
    });
  });
});
