import { ComponentFixture, TestBed } from '@angular/core/testing';
import CreateModelDialogComponent from './create-model-dialog.component';
import { ProjectInfoService } from '../project-info.service';

describe('CreateModelDialogComponent', () => {
  let component: CreateModelDialogComponent;
  let fixture: ComponentFixture<CreateModelDialogComponent>;
  let mockProjectInfoService: Partial<ProjectInfoService>;

  beforeEach(async () => {
    mockProjectInfoService = {
      projectInfo: {
        views: [],
        data_dir: '',
        model_dir: '',
        keypoint_names: [],
      } as any,
    };

    await TestBed.configureTestingModule({
      imports: [CreateModelDialogComponent],
      providers: [
        { provide: ProjectInfoService, useValue: mockProjectInfoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateModelDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
