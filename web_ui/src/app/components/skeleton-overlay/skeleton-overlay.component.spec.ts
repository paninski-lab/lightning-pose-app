import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonOverlayComponent } from './skeleton-overlay.component';
import { SKELETON_COLOR } from './skeleton-validity';

describe('SkeletonOverlayComponent', () => {
  let fixture: ComponentFixture<SkeletonOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonOverlayComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SkeletonOverlayComponent);
  });

  it('draws a blue line using the thickness and opacity inputs', () => {
    fixture.componentRef.setInput('segments', [
      { x1: 1, y1: 2, x2: 3, y2: 4 },
    ]);
    fixture.componentRef.setInput('thickness', 4);
    fixture.componentRef.setInput('opacity', 0.5);
    fixture.detectChanges();

    const line: SVGLineElement = fixture.nativeElement.querySelector('line');
    expect(line.getAttribute('stroke')).toBe(SKELETON_COLOR);
    expect(line.getAttribute('stroke-width')).toBe('4');
    expect(line.getAttribute('stroke-opacity')).toBe('0.5');
  });
});
