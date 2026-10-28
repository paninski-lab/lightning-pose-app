import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionImportComponent } from './session-import.component';
import { ProjectInfoService } from '../project-info.service';
import { SessionService } from '../session.service';
import { ToastService } from '../toast.service';

describe('SessionImportComponent', () => {
  let fixture: ComponentFixture<SessionImportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionImportComponent],
      providers: [
        {
          provide: ProjectInfoService,
          useValue: {
            projectContext: () => ({
              key: 'demo',
              projectInfo: { views: [], data_dir: '/data' },
            }),
            globalContext: () => ({ homeDir: '/home' }),
          },
        },
        { provide: SessionService, useValue: {} },
        { provide: ToastService, useValue: { showToast: () => undefined } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SessionImportComponent);
    fixture.detectChanges();
  });

  it('keeps Choose videos on the local file input until Server files is checked', () => {
    const root = fixture.nativeElement as HTMLElement;
    const checkbox = root.querySelector(
      '[data-testid="server-files-checkbox"]',
    ) as HTMLInputElement;
    const fileInput = root.querySelector('#videoFileInput') as HTMLInputElement;

    expect(checkbox.checked).toBeFalse();
    expect(root.querySelector('label[for="videoFileInput"]')).not.toBeNull();

    const clickSpy = spyOn(fileInput, 'click');
    checkbox.click();
    fixture.detectChanges();

    expect(checkbox.checked).toBeTrue();
    expect(root.querySelector('label[for="videoFileInput"]')).toBeNull();

    const choose = root.querySelector(
      '[data-testid="choose-videos"]',
    ) as HTMLButtonElement;
    expect(choose.tagName).toBe('BUTTON');
    choose.click();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
