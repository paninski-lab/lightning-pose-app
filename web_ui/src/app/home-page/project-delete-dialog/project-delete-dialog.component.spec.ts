import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectDeleteDialogComponent } from './project-delete-dialog.component';
import { ProjectInfoService } from '../../project-info.service';
import { ToastService } from '../../toast.service';

describe('ProjectDeleteDialogComponent', () => {
  let fixture: ComponentFixture<ProjectDeleteDialogComponent>;
  let deleteProject: jasmine.Spy;
  let showToast: jasmine.Spy;

  beforeEach(async () => {
    deleteProject = jasmine.createSpy('deleteProject').and.resolveTo(undefined);
    showToast = jasmine.createSpy('showToast');
    await TestBed.configureTestingModule({
      imports: [ProjectDeleteDialogComponent],
      providers: [
        {
          provide: ProjectInfoService,
          useValue: { deleteProject },
        },
        {
          provide: ToastService,
          useValue: { showToast },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectDeleteDialogComponent);
    fixture.componentRef.setInput('projectKey', 'demo');
    fixture.componentRef.setInput('dataDir', '/tmp/demo');
    fixture.componentRef.setInput('modelDir', '/tmp/demo/models');
    fixture.detectChanges();
  });

  function confirmButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      '[data-testid="delete-project-confirm"]',
    );
  }

  it('unregisters without asking for the project name', async () => {
    confirmButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(deleteProject).toHaveBeenCalledOnceWith('demo', false, undefined);
  });

  it('keeps permanent delete disabled until the project key is typed', () => {
    expect(confirmButton().disabled).toBeFalse();

    const checkbox = fixture.nativeElement.querySelector(
      '[data-testid="delete-project-permanent"]',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();

    expect(confirmButton().disabled).toBeTrue();
    const input = fixture.nativeElement.querySelector(
      '[data-testid="delete-project-confirm-name"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();

    input.value = 'wrong';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(confirmButton().disabled).toBeTrue();

    input.value = 'demo';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(confirmButton().disabled).toBeFalse();
  });

  it('sends the typed project key when permanent delete is confirmed', async () => {
    const checkbox = fixture.nativeElement.querySelector(
      '[data-testid="delete-project-permanent"]',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      '[data-testid="delete-project-confirm-name"]',
    ) as HTMLInputElement;
    input.value = 'demo';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    confirmButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(deleteProject).toHaveBeenCalledOnceWith('demo', true, 'demo');
  });

  it('keeps the dialog open and shows the server message when delete is rejected', async () => {
    deleteProject.and.rejectWith({
      error: { detail: 'Cannot use /tmp: it contains a protected directory.' },
    });
    const done = jasmine.createSpy('done');
    fixture.componentInstance.done.subscribe(done);

    confirmButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(done).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledOnceWith({
      content:
        'Failed to delete project: Cannot use /tmp: it contains a protected directory.',
      variant: 'error',
    });
  });
});
