import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CreateEksModelDialogComponent } from './create-eks-model-dialog.component';
import { ProjectInfoService } from '../project-info.service';
import { SessionService } from '../session.service';
import { ToastService } from '../toast.service';
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

  beforeEach(async () => {
    mockSessionService = jasmine.createSpyObj('SessionService', [
      'listModels',
      'createEksModel',
    ]);
    mockSessionService.listModels.and.returnValue(
      Promise.resolve({ models: [makeModel('model_a'), makeModel('model_b')] }),
    );

    const mockProjectInfoService = {
      projectInfo: { views: ['top', 'bot'], keypoint_names: [], data_dir: '', model_dir: '' },
    };

    await TestBed.configureTestingModule({
      imports: [CreateEksModelDialogComponent],
      providers: [
        { provide: SessionService, useValue: mockSessionService },
        { provide: ProjectInfoService, useValue: mockProjectInfoService },
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
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function setFormState(modelName: string, memberPaths: string[]) {
    component['form'].controls.modelName.setValue(modelName);
    component['form'].controls.memberIds.setValue(memberPaths);
    fixture.detectChanges();
  }

  function getCreateButton(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('button.btn-primary')).nativeElement;
  }

  describe('Create button disabled state', () => {
    it('is disabled when 0 models are selected', () => {
      setFormState('my_eks', []);
      expect(getCreateButton().classList).toContain('btn-disabled');
    });

    it('is enabled when 1 model is selected', () => {
      setFormState('my_eks', ['model_a']);
      expect(getCreateButton().classList).not.toContain('btn-disabled');
    });

    it('is enabled when 2 models are selected', () => {
      setFormState('my_eks', ['model_a', 'model_b']);
      expect(getCreateButton().classList).not.toContain('btn-disabled');
    });
  });
});
