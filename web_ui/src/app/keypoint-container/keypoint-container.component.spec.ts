import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Keypoint } from '../keypoint';
import { KeypointContainerComponent } from './keypoint-container.component';
import { LabelerViewOptionsService } from '../labeler/labeler-view-options.service';

describe('KeypointContainerComponent skeleton', () => {
  let fixture: ComponentFixture<KeypointContainerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeypointContainerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(KeypointContainerComponent);
    const viewOptions = {
      keypointSize: signal(10),
      keypointOpacity: signal(1),
      enableKeypointLabels: signal(false),
      keypointLabelFontSize: signal(8),
      enablePixelGrid: signal(false),
    };
    fixture.componentRef.setInput(
      'labelerViewOptions',
      viewOptions as unknown as LabelerViewOptionsService,
    );
    fixture.componentRef.setInput('keypointModels', [
      keypoint('nose', 10, 20),
      keypoint('neck', 30, 40),
    ]);
    fixture.componentRef.setInput('skeletonPairs', [['nose', 'neck']]);
    fixture.componentRef.setInput('showSkeleton', true);
    fixture.detectChanges();
  });

  it('paints the skeleton svg before the keypoint nodes', () => {
    const svg: SVGElement = fixture.nativeElement.querySelector(
      '[data-testid="skeleton-overlay"]',
    );
    const keypoint = fixture.nativeElement.querySelector('app-dropdown');
    expect(svg).not.toBeNull();
    expect(keypoint).not.toBeNull();
    expect(
      svg.compareDocumentPosition(keypoint) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

function keypoint(id: string, x: number, y: number): Keypoint {
  return {
    id,
    hoverText: signal(id),
    position: signal({ x, y }),
    color: signal([0, 128, 0]),
  };
}

describe('KeypointContainerComponent markers', () => {
  let fixture: ComponentFixture<KeypointContainerComponent>;
  let size: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeypointContainerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(KeypointContainerComponent);
    size = signal(5);
    const viewOptions = {
      keypointSize: size,
      keypointOpacity: signal(1),
      enableKeypointLabels: signal(false),
      keypointLabelFontSize: signal(8),
      enablePixelGrid: signal(false),
    };
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '200px';
    host.style.height = '100px';
    document.body.appendChild(host);
    fixture.componentRef.setInput(
      'labelerViewOptions',
      viewOptions as unknown as LabelerViewOptionsService,
    );
    fixture.componentRef.setInput('keypointModels', [
      keypoint('nose', 10.3, 20.7),
      keypoint('neck', 40, 50),
    ]);
    fixture.componentRef.setInput('useCrossHairs', true);
    fixture.componentRef.setInput('enableEditing', true);
    fixture.detectChanges();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  function marker(id: string): SVGGElement {
    return fixture.nativeElement.querySelector(
      `[data-testid="keypoint-markers"] g[data-kp-id="${id}"]`,
    );
  }

  function attr(el: Element, name: string): number {
    return Number(el.getAttribute(name));
  }

  it('draws a circle centered on a fractional position, radius half the size', () => {
    for (const s of [5, 10]) {
      size.set(s);
      fixture.detectChanges();
      const circle = marker('nose').querySelector('circle')!;
      expect(attr(circle, 'cx')).withContext(`size ${s}`).toBe(10.3);
      expect(attr(circle, 'cy')).withContext(`size ${s}`).toBe(20.7);
      expect(attr(circle, 'r'))
        .withContext(`size ${s}`)
        .toBe(s / 2);
    }
  });

  it('crosses the cross at the keypoint position', () => {
    const [h, v] = Array.from(marker('nose').querySelectorAll('line'));
    expect(attr(h, 'y1')).toBe(20.7);
    expect(attr(h, 'y2')).toBe(20.7);
    expect((attr(h, 'x1') + attr(h, 'x2')) / 2).toBeCloseTo(10.3, 10);
    expect(attr(v, 'x1')).toBe(10.3);
    expect(attr(v, 'x2')).toBe(10.3);
    expect((attr(v, 'y1') + attr(v, 'y2')) / 2).toBeCloseTo(20.7, 10);
  });

  it('rings the selected keypoint inside its marker', () => {
    expect(marker('nose').querySelector('.keypoint-selected-ring')).toBeNull();
    fixture.componentRef.setInput('selectedKeypoint', 'nose');
    fixture.detectChanges();
    const ring = marker('nose').querySelector('.keypoint-selected-ring')!;
    expect(attr(ring, 'cx')).toBe(10.3);
    expect(attr(ring, 'r')).toBeLessThan(2.5);
  });

  it('selects a keypoint when its hit target is clicked', () => {
    const target: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="keypoint-hit-target"][aria-label="neck"]',
    );
    target.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedKeypoint()).toBe('neck');
    expect(target.getAttribute('aria-pressed')).toBe('true');
  });

  it('moves a dragged keypoint by exactly the pointer movement', () => {
    const emitted: { kp: string; position: { x: number; y: number } }[] = [];
    fixture.componentInstance.keypointUpdated.subscribe((e) => emitted.push(e));
    const container: HTMLElement =
      fixture.nativeElement.querySelector('div.relative');
    const origin = container.getBoundingClientRect();
    const target: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="keypoint-hit-target"][aria-label="nose"]',
    );
    // Press 1px right and 1px below the true center, then move by (5, -3).
    const down = { x: origin.left + 11.3, y: origin.top + 21.7 };
    container.setPointerCapture = () => undefined;
    container.releasePointerCapture = () => undefined;
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: down.x,
        clientY: down.y,
      }),
    );
    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    container.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: down.x + 5,
        clientY: down.y - 3,
      }),
    );
    container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    expect(emitted.length).toBe(1);
    expect(emitted[0].kp).toBe('nose');
    expect(emitted[0].position.x).toBeCloseTo(15.3, 6);
    expect(emitted[0].position.y).toBeCloseTo(17.7, 6);
  });

  it('gives Viewer markers a shadow and Labeler markers none', () => {
    const svg = () =>
      fixture.nativeElement.querySelector('[data-testid="keypoint-markers"]');
    expect(svg().classList).not.toContain('keypoint-markers-shadow');
    fixture.componentRef.setInput('labelerViewOptions', undefined);
    fixture.componentRef.setInput('viewerViewOptions', {
      keypointSize: size,
      keypointOpacity: signal(1),
      enableKeypointLabels: signal(false),
      keypointLabelFontSize: signal(8),
    });
    fixture.detectChanges();
    expect(svg().classList).toContain('keypoint-markers-shadow');
  });
});

describe('KeypointContainerComponent labels', () => {
  let fixture: ComponentFixture<KeypointContainerComponent>;
  let fontSize: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeypointContainerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(KeypointContainerComponent);
    fontSize = signal(2);
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '200px';
    host.style.height = '100px';
    document.body.appendChild(host);
    fixture.componentRef.setInput('labelerViewOptions', {
      keypointSize: signal(10),
      keypointOpacity: signal(1),
      enableKeypointLabels: signal(true),
      keypointLabelFontSize: fontSize,
      enablePixelGrid: signal(false),
    } as unknown as LabelerViewOptionsService);
    fixture.componentRef.setInput('keypointModels', [keypoint('L1A', 40, 30)]);
    fixture.detectChanges();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  const label = (): SVGTextElement =>
    fixture.nativeElement.querySelector(
      '[data-testid="keypoint-labels"] text[data-kp-id="L1A"]',
    );

  async function settle() {
    // ResizeObserver reports the frame, then the label is measured and placed.
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      fixture.detectChanges();
    }
  }

  it('draws names as SVG text with a round-joined outline under the letters', () => {
    // An HTML text stroke drew pointed spikes at sharp letter corners.
    const style = getComputedStyle(label());
    expect(label().textContent!.trim()).toBe('L1A');
    expect(style.strokeLinejoin).toBe('round');
    // Chrome reports `stroke fill` as `stroke`: stroke first, then fill.
    expect(style.paintOrder).toBe('stroke');
    expect(style.stroke).toBe('rgb(0, 0, 0)');
  });

  it('scales the outline with the label size', () => {
    const strokeWidth = () => parseFloat(getComputedStyle(label()).strokeWidth);
    expect(strokeWidth()).toBeCloseTo(0.5, 5);
    fontSize.set(8);
    fixture.detectChanges();
    expect(strokeWidth()).toBeCloseTo(2, 5);
  });

  it('places the name at the lower-right of its marker, in image coordinates', async () => {
    await settle();
    expect(label().style.visibility).toBe('');
    const box = label().getBBox();
    // Marker at (40, 30), radius 5: the name starts right of and below its center.
    expect(box.x).toBeGreaterThan(40);
    expect(box.y).toBeGreaterThan(30);
    expect(box.x).toBeLessThan(46);
    expect(box.y).toBeLessThan(36);
  });
});
