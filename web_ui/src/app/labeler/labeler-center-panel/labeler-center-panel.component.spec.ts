import { Component, input, model, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { LabelerCenterPanelComponent } from './labeler-center-panel.component';
import { ImageLabelWidgetComponent } from '../image-label-widget/image-label-widget.component';
import { ProjectInfoService } from '../../project-info.service';
import { CameraCalibrationService } from '../../camera-calibration.service';
import { MVFrame } from '../frame.model';
import { ContextSlotView } from '../temporal-context';
import { LabelerViewOptionsService } from '../labeler-view-options.service';

describe('LabelerCenterPanelComponent', () => {
  let component: LabelerCenterPanelComponent;
  let fixture: ComponentFixture<LabelerCenterPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LabelerCenterPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LabelerCenterPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('LabelerCenterPanelComponent temporal context', () => {
  let fixture: ComponentFixture<LabelerCenterPanelComponent>;

  beforeEach(async () => {
    const projectInfo = jasmine.createSpyObj(
      'ProjectInfoService',
      ['projectContext'],
      { projectInfo: { data_dir: 'data', views: [] } },
    );
    projectInfo.projectContext.and.returnValue(null);
    const calibration = jasmine.createSpyObj('CameraCalibrationService', [
      'getCalibrationStatus',
    ]);
    calibration.getCalibrationStatus.and.resolveTo('none');

    await TestBed.configureTestingModule({
      imports: [LabelerCenterPanelComponent],
      providers: [
        { provide: ProjectInfoService, useValue: projectInfo },
        { provide: CameraCalibrationService, useValue: calibration },
      ],
    })
      .overrideComponent(LabelerCenterPanelComponent, {
        remove: { imports: [ImageLabelWidgetComponent] },
        add: { imports: [ImageLabelWidgetStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(LabelerCenterPanelComponent);
    fixture.componentRef.setInput('numLabeledFramesGetter', () => 0);
    fixture.componentRef.setInput('labelFile', {
      key: 'CollectedData',
      views: [{ viewName: 'main', csvPath: 'CollectedData.csv' }],
    });
  });

  function showFrame(imgPath: string) {
    const frame: MVFrame = {
      key: imgPath,
      views: [
        { viewName: 'main', imgPath, keypoints: [], originalKeypoints: [] },
      ],
    };
    fixture.componentRef.setInput('frame', frame);
    fixture.detectChanges();
  }

  function button(label: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(`button[aria-label="${label}"]`);
  }

  function contextLabel(): string {
    return fixture.nativeElement
      .querySelector('[data-testid="context-frame-label"]')
      .textContent.trim();
  }

  function click(label: string) {
    button(label).click();
    fixture.detectChanges();
  }

  afterEach(() => viewOptions().pauseTemporalContext());

  function viewOptions(): LabelerViewOptionsService {
    return fixture.debugElement.injector.get(LabelerViewOptionsService);
  }

  it('opens a frame paused on the current frame', () => {
    showFrame('labeled-data/s/img00000042.png');
    expect(button('Play temporal context').disabled).toBeFalse();
    expect(contextLabel()).toBe('Showing: current');
    expect(
      button('Show context frame current').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      button(
        'Play temporal context',
      ).parentElement!.parentElement!.getAttribute('data-tip'),
    ).toBeNull();
  });

  it('steps one context frame at a time and stops at the ends', () => {
    showFrame('labeled-data/s/img00000042.png');
    click('Next context frame');
    expect(contextLabel()).toBe('Showing: +1');
    click('Next context frame');
    expect(contextLabel()).toBe('Showing: +2');
    expect(button('Next context frame').disabled).toBeTrue();
    click('Previous context frame');
    expect(contextLabel()).toBe('Showing: +1');
  });

  it('jumps to a context frame when its dot is clicked', () => {
    showFrame('labeled-data/s/img00000042.png');
    click('Show context frame −2');
    expect(contextLabel()).toBe('Showing: −2');
    expect(button('Previous context frame').disabled).toBeTrue();
    expect(button('Show context frame −2').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('plays, and Pause holds the visible frame', () => {
    jasmine.clock().install();
    try {
      showFrame('labeled-data/s/img00000042.png');
      click('Play temporal context');
      expect(button('Pause temporal context')).not.toBeNull();
      jasmine.clock().tick(300);
      fixture.detectChanges();
      expect(contextLabel()).toBe('Showing: +1');
      click('Pause temporal context');
      jasmine.clock().tick(900);
      fixture.detectChanges();
      expect(contextLabel()).toBe('Showing: +1');
      expect(button('Play temporal context')).not.toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('returns to the current frame when another frame opens', () => {
    showFrame('labeled-data/s/img00000042.png');
    click('Show context frame +2');
    showFrame('labeled-data/s/img00000043.png');
    expect(contextLabel()).toBe('Showing: current');
  });

  function widget(): ImageLabelWidgetStubComponent {
    return fixture.debugElement.query(
      By.directive(ImageLabelWidgetStubComponent),
    ).componentInstance;
  }

  function expectControlsDisabled() {
    for (const label of [
      'Play temporal context',
      'Previous context frame',
      'Next context frame',
      'Show context frame +1',
    ]) {
      expect(button(label).disabled).withContext(label).toBeTrue();
    }
  }

  function tip(): string | null {
    return button(
      'Play temporal context',
    ).parentElement!.parentElement!.getAttribute('data-tip');
  }

  it('disables the controls and says so when the context frames are not found', () => {
    showFrame('labeled-data/s/img00000042.png');
    expect(button('Play temporal context').disabled).toBeFalse();
    widget().contextFramesMissing.set(true);
    fixture.detectChanges();
    expectControlsDisabled();
    expect(tip()).toBe('Context frames were not found.');
  });

  it('stops playback and returns to the current frame when the context frames are not found', () => {
    showFrame('labeled-data/s/img00000042.png');
    click('Play temporal context');
    widget().contextFramesMissing.set(true);
    fixture.detectChanges();
    expect(viewOptions().isPlayingTemporalContext()).toBeFalse();
    expect(contextLabel()).toBe('Showing: current');
  });

  it('says the current frame is shown when a context frame was not found', () => {
    showFrame('labeled-data/s/img00000099.png');
    widget().contextSlotViews.set([
      { shownOffset: -2, substitute: null },
      { shownOffset: -1, substitute: null },
      { shownOffset: 0, substitute: null },
      { shownOffset: 1, substitute: null },
      { shownOffset: 0, substitute: 'not-found' },
    ]);
    click('Show context frame +1');
    expect(contextLabel()).toBe('Showing: +1');
    click('Show context frame +2');
    expect(contextLabel()).toBe('Showing: current in place of +2 (not found)');
  });

  it('says which frame is shown before the start of the video', () => {
    showFrame('labeled-data/s/img00000000.png');
    widget().contextSlotViews.set([
      { shownOffset: 0, substitute: 'before-start' },
      { shownOffset: 0, substitute: 'before-start' },
      { shownOffset: 0, substitute: null },
      { shownOffset: 1, substitute: null },
      { shownOffset: 2, substitute: null },
    ]);
    click('Show context frame −1');
    expect(contextLabel()).toBe(
      'Showing: current in place of −1 (before the video starts)',
    );
  });

  it("says the frame's own image could not be loaded before blaming context frames", () => {
    showFrame('labeled-data/s/img00000042.png');
    widget().currentFrameMissing.set(true);
    widget().contextFramesMissing.set(true);
    fixture.detectChanges();
    expectControlsDisabled();
    expect(tip()).toBe("This frame's image could not be loaded.");
  });

  it('disables the controls and explains why when the file name has no frame number', () => {
    showFrame('labeled-data/s/frame_a.png');
    expectControlsDisabled();
    expect(tip()).toBe('The image file name has no frame number.');
  });
});

@Component({ selector: 'app-image-label-widget', template: '' })
class ImageLabelWidgetStubComponent {
  fv = input();
  revision = input();
  selectedKeypoint = model<string | null>(null);
  disableInteractions = input();
  zoomableInteractivityDisabled = input();
  keypointUpdated = output<unknown>();
  zoomableContent = () => null;
  contextFramesMissing = signal(false);
  currentFrameMissing = signal(false);
  contextSlotViews = signal<ContextSlotView[] | null>(null);
}
