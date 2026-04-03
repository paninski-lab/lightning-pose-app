import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectHomePageComponent } from './project-home-page.component';
import { provideRouter } from '@angular/router';

describe('ProjectHomePageComponent', () => {
  let component: ProjectHomePageComponent;
  let fixture: ComponentFixture<ProjectHomePageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectHomePageComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectHomePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
