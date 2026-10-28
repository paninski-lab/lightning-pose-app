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
import { SessionService } from '../../session.service';

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

  it('shows a Back to the current frame button only away from the current frame', () => {
    showFrame('labeled-data/s/img00000042.png');
    const reset = () => button('Back to the current frame');
    expect(reset()).toBeNull();

    click('Show context frame +2');
    expect(reset().classList).toContain('btn-warning');
    expect(reset().textContent!.trim()).toBe('restart_alt');
    const tip = reset().closest('[data-tip]')!;
    expect(tip.getAttribute('data-tip')).toBe('Back to the current frame');
    // Opens to the left: centered, the right side panel's edge cuts it off.
    expect(tip.classList).toContain('tooltip-left');
    click('Back to the current frame');
    expect(contextLabel()).toBe('Showing: current');
    expect(reset()).toBeNull();
  });

  it('shows the Back button while playing and stops playback with one click', () => {
    jasmine.clock().install();
    try {
      showFrame('labeled-data/s/img00000042.png');
      click('Play temporal context');
      jasmine.clock().tick(1000);
      fixture.detectChanges();
      click('Back to the current frame');
      expect(viewOptions().isPlayingTemporalContext()).toBeFalse();
      expect(contextLabel()).toBe('Showing: current');
      expect(button('Back to the current frame')).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
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
    widget().currentFrameMessage.set("This frame's image could not be loaded.");
    widget().contextFramesMissing.set(true);
    fixture.detectChanges();
    expectControlsDisabled();
    expect(tip()).toBe("This frame's image could not be loaded.");
  });

  it('says why a TIFF frame has no temporal context', () => {
    showFrame('labeled-data/s/img00000042.tif');
    widget().currentFrameMessage.set(
      'TIFF frames train in Lightning Pose but cannot be shown in the browser. Convert them to PNG to label or review them here.',
    );
    fixture.detectChanges();
    expectControlsDisabled();
    expect(tip()).toContain('TIFF frames train in Lightning Pose');
  });

  it('disables the controls and explains why when the file name has no frame number', () => {
    showFrame('labeled-data/s/frame_a.png');
    expectControlsDisabled();
    expect(tip()).toBe('The image file name has no frame number.');
  });
});

describe('LabelerCenterPanelComponent side panel', () => {
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
    const frame: MVFrame = {
      key: 'f',
      views: [
        {
          viewName: 'main',
          imgPath: 'labeled-data/s/img00000042.png',
          keypoints: [],
          originalKeypoints: [],
        },
      ],
    };
    fixture.componentRef.setInput('frame', frame);
    fixture.detectChanges();
  });

  function slider(label: string): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      `input[type="range"][aria-label="${label}"]`,
    );
  }

  it('puts Save, Next and Revert right under the keypoint list, before View options', () => {
    const el: HTMLElement = fixture.nativeElement;
    const titles = Array.from(el.querySelectorAll('.app-accordion-title h1'));
    const keypoints = titles.find((h) => h.textContent!.trim() === 'Keypoints')!;
    const viewOptions = titles.find(
      (h) => h.textContent!.trim() === 'View options',
    )!;
    const actions = el.querySelector('[data-testid="frame-actions"]')!;
    const before = Node.DOCUMENT_POSITION_PRECEDING;
    const after = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(actions.compareDocumentPosition(keypoints) & before).toBeTruthy();
    expect(actions.compareDocumentPosition(viewOptions) & after).toBeTruthy();
    expect(actions.textContent).toContain('Save and next');
    expect(actions.textContent).toContain('Next →');
    expect(actions.textContent).toContain('Revert changes');
  });

  it('lets the image and keypoint sliders reach their wider limits', () => {
    expect([slider('Image size').min, slider('Image size').max]).toEqual([
      '200',
      '1600',
    ]);
    expect([
      slider('Image brightness').min,
      slider('Image brightness').max,
    ]).toEqual(['0', '2']);
    expect([slider('Image contrast').min, slider('Image contrast').max]).toEqual(
      ['0', '2'],
    );
    expect(slider('Keypoint opacity').max).toBe('1');
  });
});

describe('LabelerCenterPanelComponent Next and keypoint selection', () => {
  const KEEP_KEY = 'labeler-view-options.keepSelectedKeypoint';
  let fixture: ComponentFixture<LabelerCenterPanelComponent>;
  let session: jasmine.SpyObj<SessionService>;
  let saved: string | null;

  const NAMES = ['nose', 'ear', 'tail'];

  /** A frame with the given views; image files are named <key>_<view>.png. */
  function makeFrame(
    key: string,
    views: string[],
    opts: { unlabeled?: boolean; editedView?: string } = {},
  ): MVFrame {
    return {
      key,
      views: views.map((viewName) => {
        const keypoints = NAMES.map((keypointName, i) => ({
          keypointName,
          x: opts.unlabeled ? NaN : i,
          y: opts.unlabeled ? NaN : i,
        }));
        return {
          viewName,
          imgPath: `labeled-data/s/${key}_${viewName}.png`,
          keypoints:
            viewName === opts.editedView
              ? keypoints.map((kp) => ({ ...kp, x: kp.x + 5 }))
              : keypoints,
          originalKeypoints: opts.unlabeled ? null : keypoints,
        };
      }),
    };
  }

  beforeEach(async () => {
    saved = localStorage.getItem(KEEP_KEY);
    localStorage.removeItem(KEEP_KEY);
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
    session = jasmine.createSpyObj('SessionService', ['saveMVFrame']);
    session.saveMVFrame.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [LabelerCenterPanelComponent],
      providers: [
        { provide: ProjectInfoService, useValue: projectInfo },
        { provide: CameraCalibrationService, useValue: calibration },
        { provide: SessionService, useValue: session },
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
      views: [{ viewName: 'top', csvPath: 'CollectedData_top.csv' }],
    });
  });

  afterEach(() => {
    if (saved === null) localStorage.removeItem(KEEP_KEY);
    else localStorage.setItem(KEEP_KEY, saved);
  });

  function open(frame: MVFrame, hasNextFrame = true) {
    fixture.componentRef.setInput('hasNextFrame', hasNextFrame);
    fixture.componentRef.setInput('frame', frame);
    fixture.detectChanges();
  }

  function actionButton(text: string): HTMLButtonElement {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll(
        '[data-testid="frame-actions"] button',
      ),
    );
    return buttons.find((b) => b.textContent!.includes(text))!;
  }

  function clickNext() {
    actionButton('Next →').click();
    fixture.detectChanges();
  }

  /** File name of the image in the main view's header, e.g. "f1_side.png". */
  function shownImage(): string {
    const spans: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('span.truncate'),
    );
    return spans
      .map((el) => el.textContent!.trim())
      .find((text) => !text.includes('/'))!;
  }

  function keypointRow(name: string): HTMLElement {
    const rows: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('li'),
    );
    return rows.find(
      (li) => li.querySelector('span')!.textContent!.trim() === name,
    )!;
  }

  /** Name of the highlighted row in the keypoint list. */
  function selectedKeypoint(): string {
    return fixture.nativeElement
      .querySelector('li.bg-sky-700 span')
      .textContent.trim();
  }

  function selectKeypoint(name: string) {
    keypointRow(name).click();
    fixture.detectChanges();
  }

  it('Next walks the views of a frame, then opens the next frame on its first view, without saving', () => {
    const nextFrame = jasmine.createSpy('nextFrame');
    fixture.componentInstance.nextFrame.subscribe(nextFrame);
    open(makeFrame('f1', ['top', 'side', 'front']));
    expect(shownImage()).toBe('f1_top.png');

    clickNext();
    expect(shownImage()).toBe('f1_side.png');
    clickNext();
    expect(shownImage()).toBe('f1_front.png');
    expect(nextFrame).not.toHaveBeenCalled();

    clickNext();
    expect(nextFrame).toHaveBeenCalledTimes(1);
    open(makeFrame('f2', ['top', 'side', 'front']));
    expect(shownImage()).toBe('f2_top.png');
    expect(session.saveMVFrame).not.toHaveBeenCalled();
  });

  it('Next opens the next frame from a single view, and is inactive on the last view of the last frame', () => {
    const nextFrame = jasmine.createSpy('nextFrame');
    fixture.componentInstance.nextFrame.subscribe(nextFrame);
    open(makeFrame('f1', ['top']));
    clickNext();
    expect(nextFrame).toHaveBeenCalledTimes(1);

    open(makeFrame('f2', ['top', 'side']), false);
    expect(actionButton('Next →').classList).not.toContain('btn-disabled');
    clickNext();
    expect(shownImage()).toBe('f2_side.png');
    expect(actionButton('Next →').classList).toContain('btn-disabled');
  });

  it('Save and next from the last view opens the next frame on its first view', async () => {
    const events: { shouldAdvanceFrame: boolean }[] = [];
    fixture.componentInstance.saved.subscribe((e) => events.push(e));
    open(makeFrame('f1', ['top', 'side'], { editedView: 'side' }));
    clickNext();
    expect(shownImage()).toBe('f1_side.png');

    actionButton('Save and next').click();
    // Let the save promise and its .then() run.
    await session.saveMVFrame.calls.mostRecent().returnValue;
    await Promise.resolve();
    expect(session.saveMVFrame).toHaveBeenCalledTimes(1);
    expect(events[0].shouldAdvanceFrame).toBeTrue();

    open(makeFrame('f2', ['top', 'side']));
    expect(shownImage()).toBe('f2_top.png');
  });

  it('Back walks the views back, then opens the previous frame on its last view, without saving', () => {
    const previousFrame = jasmine.createSpy('previousFrame');
    fixture.componentInstance.previousFrame.subscribe(previousFrame);
    fixture.componentRef.setInput('hasPreviousFrame', true);
    open(makeFrame('f2', ['top', 'side', 'front']));
    clickNext();
    clickNext();
    expect(shownImage()).toBe('f2_front.png');

    actionButton('← Back').click();
    fixture.detectChanges();
    expect(shownImage()).toBe('f2_side.png');
    actionButton('← Back').click();
    fixture.detectChanges();
    expect(shownImage()).toBe('f2_top.png');
    expect(previousFrame).not.toHaveBeenCalled();

    actionButton('← Back').click();
    fixture.detectChanges();
    expect(previousFrame).toHaveBeenCalledTimes(1);
    open(makeFrame('f1', ['top', 'side', 'front']));
    expect(shownImage()).toBe('f1_front.png');
    expect(session.saveMVFrame).not.toHaveBeenCalled();

    // On the first view of the first frame there is nowhere to go back to.
    fixture.componentRef.setInput('hasPreviousFrame', false);
    open(makeFrame('f0', ['top', 'side', 'front'], { unlabeled: true }));
    expect(shownImage()).toBe('f0_top.png');
    expect(actionButton('← Back').classList).toContain('btn-disabled');
  });

  it('Clear view empties the selected view only, without saving', () => {
    const frame = makeFrame('f1', ['top', 'side']);
    open(frame);
    const clear = (): HTMLButtonElement =>
      fixture.nativeElement.querySelector(
        'button[aria-label="Clear all keypoints in this view"]',
      );
    expect(clear().disabled).toBeFalse();

    clear().click();
    fixture.detectChanges();
    expect(frame.views[0].keypoints.every((kp) => isNaN(kp.x))).toBeTrue();
    expect(frame.views[1].keypoints.every((kp) => !isNaN(kp.x))).toBeTrue();
    expect(clear().disabled).toBeTrue();
    expect(actionButton('Revert changes').classList).not.toContain(
      'btn-disabled',
    );
    expect(session.saveMVFrame).not.toHaveBeenCalled();
  });

  it('selects the first keypoint on a new view unless Keep selected keypoint is on', () => {
    open(makeFrame('f1', ['top', 'side', 'front']));
    selectKeypoint('tail');
    clickNext();
    expect(selectedKeypoint()).toBe('nose');

    const keep: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[aria-label="Keep selected keypoint"]',
    );
    expect(keep.checked).toBeFalse();
    keep.click();
    fixture.detectChanges();
    selectKeypoint('tail');
    clickNext();
    expect(shownImage()).toBe('f1_front.png');
    expect(selectedKeypoint()).toBe('tail');

    // Also on the next frame, including one from the remaining list.
    clickNext();
    open(makeFrame('f2', ['top', 'side', 'front'], { unlabeled: true }));
    expect(shownImage()).toBe('f2_top.png');
    expect(selectedKeypoint()).toBe('tail');
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
  currentFrameMessage = signal<string | null>(null);
  contextSlotViews = signal<ContextSlotView[] | null>(null);
}
