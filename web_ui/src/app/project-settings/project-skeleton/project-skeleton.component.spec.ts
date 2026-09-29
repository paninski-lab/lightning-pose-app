import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectSkeletonComponent } from './project-skeleton.component';

describe('ProjectSkeletonComponent', () => {
  let fixture: ComponentFixture<ProjectSkeletonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectSkeletonComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ProjectSkeletonComponent);
    fixture.componentRef.setInput('keypointNames', ['nose', 'neck', 'tail']);
    fixture.componentRef.setInput('skeleton', []);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('adds a second pair that reuses a keypoint, and remove drops one pair', () => {
    expect(fixture.nativeElement.querySelector('.text-error')).toBeNull();

    clickAdd(fixture);
    fixture.detectChanges();
    expect(fixture.componentInstance.skeleton()).toEqual([['nose', 'neck']]);

    const selects: HTMLSelectElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('select'),
    );
    selects[1].value = 'tail';
    selects[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    clickAdd(fixture);
    fixture.detectChanges();
    expect(fixture.componentInstance.skeleton()).toEqual([
      ['nose', 'neck'],
      ['nose', 'tail'],
    ]);
    expect(fixture.nativeElement.querySelector('.text-error')).toBeNull();

    const remove: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[aria-label="Remove nose neck"]',
    );
    remove.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.skeleton()).toEqual([['nose', 'tail']]);
  });

  it('shows the explanation and does not emit a pair that fails the check', () => {
    const selects: HTMLSelectElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('select'),
    );
    selects[1].value = 'nose';
    selects[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    clickAdd(fixture);
    fixture.detectChanges();

    expect(fixture.componentInstance.skeleton()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.text-error').textContent).toContain(
      'nose',
    );
  });
});

function clickAdd(fixture: ComponentFixture<ProjectSkeletonComponent>) {
  const add: HTMLButtonElement = fixture.nativeElement.querySelector(
    'button[aria-label="Add pair"]',
  );
  add.click();
}
