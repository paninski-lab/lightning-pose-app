import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonViewOptionsComponent } from './skeleton-view-options.component';

describe('SkeletonViewOptionsComponent', () => {
  let fixture: ComponentFixture<SkeletonViewOptionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonViewOptionsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SkeletonViewOptionsComponent);
  });

  function sliders(): HTMLInputElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('input[type="range"]'),
    );
  }

  it('hides the sliders when the switch is off and shows them when it is on', () => {
    fixture.componentRef.setInput('showSkeleton', false);
    fixture.detectChanges();
    expect(sliders().length).toBe(0);

    fixture.componentRef.setInput('showSkeleton', true);
    fixture.detectChanges();
    expect(sliders().length).toBe(2);
  });

  it('names the sliders Skeleton thickness and Skeleton opacity', () => {
    fixture.componentRef.setInput('showSkeleton', true);
    fixture.detectChanges();
    expect(sliders().map((s) => s.getAttribute('aria-label'))).toEqual([
      'Skeleton thickness',
      'Skeleton opacity',
    ]);
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Skeleton thickness');
    expect(text).toContain('Skeleton opacity');
    expect(text).not.toContain('Bone');
  });

  it('disables the switch and hides the sliders when the skeleton is invalid', () => {
    fixture.componentRef.setInput('showSkeleton', true);
    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    const toggle: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[aria-label="Show skeleton"]',
    );
    expect(toggle.disabled).toBeTrue();
    expect(toggle.checked).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain(
      'Skeleton definition is invalid.',
    );
    expect(sliders().length).toBe(0);
  });
});
