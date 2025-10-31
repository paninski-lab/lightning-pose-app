import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectHomePageComponent } from './project-home-page.component';

describe('ProjectHomePageComponent', () => {
  let component: ProjectHomePageComponent;
  let fixture: ComponentFixture<ProjectHomePageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectHomePageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectHomePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
