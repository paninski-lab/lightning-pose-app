import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectSettingsComponent } from './project-settings.component';

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
