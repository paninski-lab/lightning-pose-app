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

  it('shows the switch off and disabled when there are no skeleton pairs, without changing the saved setting', () => {
    const changes: boolean[] = [];
    fixture.componentInstance.showSkeleton.subscribe((v) => changes.push(v));
    fixture.componentRef.setInput('showSkeleton', true);
    fixture.componentRef.setInput('noPairs', true);
    fixture.detectChanges();

    const toggle: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[aria-label="Show skeleton"]',
    );
    expect(toggle.checked).toBeFalse();
    expect(toggle.disabled).toBeTrue();
    expect(sliders().length).toBe(0);

    // Once the project has pairs, the saved setting (on) shows again.
    fixture.componentRef.setInput('noPairs', false);
    fixture.detectChanges();
    expect(toggle.checked).toBeTrue();
    expect(toggle.disabled).toBeFalse();
    expect(sliders().length).toBe(2);
    expect(changes).toEqual([]);
  });

  it('shows the thickness and opacity values unless showValues is off', () => {
    fixture.componentRef.setInput('showSkeleton', true);
    fixture.componentRef.setInput('thickness', 2.5);
    fixture.componentRef.setInput('opacity', 0.75);
    fixture.detectChanges();
    const text = () => fixture.nativeElement.textContent as string;
    expect(text()).toContain('2.5px');
    expect(text()).toContain('0.75');

    fixture.componentRef.setInput('showValues', false);
    fixture.detectChanges();
    expect(text()).not.toContain('2.5px');
    expect(text()).not.toContain('0.75');
    expect(sliders().length).toBe(2);
  });
});
