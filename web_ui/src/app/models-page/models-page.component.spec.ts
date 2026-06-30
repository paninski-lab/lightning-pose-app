import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelsPageComponent } from './models-page.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ProjectInfoService } from '../project-info.service';

describe('ModelsPageComponent', () => {
  let component: ModelsPageComponent;
  let fixture: ComponentFixture<ModelsPageComponent>;
  let mockProjectInfoService: jasmine.SpyObj<ProjectInfoService>;

  beforeEach(async () => {
    mockProjectInfoService = jasmine.createSpyObj('ProjectInfoService', ['projectContext'], {
      projectInfo: { views: [], model_dir: '/mock/model/dir' },
    });
    mockProjectInfoService.projectContext.and.returnValue(null);

    await TestBed.configureTestingModule({
      imports: [ModelsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProjectInfoService, useValue: mockProjectInfoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
