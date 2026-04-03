import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExtractFramesDialogComponent } from './extract-frames-dialog.component';
import { ProjectInfoService } from '../../project-info.service';

describe('ExtractFramesDialogComponent', () => {
  let component: ExtractFramesDialogComponent;
  let fixture: ComponentFixture<ExtractFramesDialogComponent>;
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
      imports: [ExtractFramesDialogComponent],
      providers: [
        { provide: ProjectInfoService, useValue: mockProjectInfoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExtractFramesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
