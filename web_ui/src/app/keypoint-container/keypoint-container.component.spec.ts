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
