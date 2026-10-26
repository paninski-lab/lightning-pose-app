import { Component, input, model, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageLabelWidgetComponent } from './image-label-widget.component';
import { KeypointContainerComponent } from '../../keypoint-container/keypoint-container.component';
import { LabelerViewOptionsService } from '../labeler-view-options.service';
import { ProjectInfoService } from '../../project-info.service';
import { FrameView } from '../frame.model';

@Component({ selector: 'app-keypoint-container', template: '' })
class KeypointContainerStubComponent {
  enableEditing = input();
  keypointModels = input();
  selectedKeypoint = model<string | null>(null);
  useCrossHairs = input();
  editMode = input();
  labelerViewOptions = input();
  enableKeypointHoverTooltips = input();
  skeletonPairs = input();
  showSkeleton = input();
  skeletonThickness = input();
  skeletonOpacity = input();
  keypointUpdated = output<unknown>();
}

const FILES = '/app/v0/files/data/';

describe('ImageLabelWidgetComponent context frames', () => {
  let fixture: ComponentFixture<ImageLabelWidgetComponent>;
  let viewOptions: LabelerViewOptionsService;

  beforeEach(async () => {
    const projectInfo = jasmine.createSpyObj(
      'ProjectInfoService',
      ['projectContext'],
      { projectInfo: { data_dir: 'data' } },
    );
    projectInfo.projectContext.and.returnValue(null);

    await TestBed.configureTestingModule({
      imports: [ImageLabelWidgetComponent],
      providers: [
        LabelerViewOptionsService,
        { provide: ProjectInfoService, useValue: projectInfo },
      ],
    })
      .overrideComponent(ImageLabelWidgetComponent, {
        remove: { imports: [KeypointContainerComponent] },
        add: { imports: [KeypointContainerStubComponent] },
      })
      .compileComponents();

    viewOptions = TestBed.inject(LabelerViewOptionsService);
    fixture = TestBed.createComponent(ImageLabelWidgetComponent);
  });

  function show(imgPath: string) {
    const fv: FrameView = {
      viewName: 'main',
      imgPath,
      keypoints: [],
      originalKeypoints: [],
    };
    fixture.componentRef.setInput('fv', fv);
    fixture.detectChanges();
  }

  function images(): HTMLImageElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('img'));
  }

  function visibleSrcs(): string[] {
    return images()
      .filter((img) => !img.classList.contains('hidden'))
      .map((img) => img.getAttribute('src')!);
  }

  it('shows frame 0 itself, not frame 2, under the keypoints', () => {
    show('labeled-data/s/img00000000.png');
    expect(images().map((img) => img.getAttribute('src'))).toEqual([
      FILES + 'labeled-data/s/img00000000.png',
      FILES + 'labeled-data/s/img00000000.png',
      FILES + 'labeled-data/s/img00000000.png',
      FILES + 'labeled-data/s/img00000001.png',
      FILES + 'labeled-data/s/img00000002.png',
    ]);
    expect(visibleSrcs()).toEqual([FILES + 'labeled-data/s/img00000000.png']);
  });

  it('shows frame 1 itself under the keypoints', () => {
    show('labeled-data/s/img00000001.png');
    expect(visibleSrcs()).toEqual([FILES + 'labeled-data/s/img00000001.png']);
  });

  it('shows the image when its file name has no frame number', () => {
    show('labeled-data/s/frame_a.png');
    expect(images().length).toBe(1);
    expect(visibleSrcs()).toEqual([FILES + 'labeled-data/s/frame_a.png']);
  });

  it('keeps the image visible on any context slot when there is no frame number', () => {
    show('labeled-data/s/frame_a.png');
    viewOptions.jumpToTemporalContextSlot(4);
    fixture.detectChanges();
    expect(visibleSrcs()).toEqual([FILES + 'labeled-data/s/frame_a.png']);
  });

  it('shows the context slot chosen in view options', () => {
    show('labeled-data/s/img00000042.png');
    viewOptions.jumpToTemporalContextSlot(0);
    fixture.detectChanges();
    expect(visibleSrcs()).toEqual([FILES + 'labeled-data/s/img00000040.png']);
  });

  it('shows keypoints only when paused on the current frame', () => {
    const keypoints = () =>
      fixture.nativeElement.querySelector('app-keypoint-container');
    show('labeled-data/s/img00000042.png');
    expect(keypoints()).not.toBeNull();

    viewOptions.jumpToTemporalContextSlot(3);
    fixture.detectChanges();
    expect(keypoints()).toBeNull();

    viewOptions.jumpToTemporalContextSlot(2);
    fixture.detectChanges();
    expect(keypoints()).not.toBeNull();

    viewOptions.playTemporalContext();
    fixture.detectChanges();
    expect(keypoints()).toBeNull();
    viewOptions.pauseTemporalContext();
  });

  it('shows the current frame in a slot whose image fails to load', () => {
    show('labeled-data/s/img00000042.png');
    images()[4].dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(images()[4].getAttribute('src')).toBe(
      FILES + 'labeled-data/s/img00000042.png',
    );
    expect(images()[3].getAttribute('src')).toBe(
      FILES + 'labeled-data/s/img00000043.png',
    );
  });

  it('shows the current frame past the end of the video, as LP does', () => {
    // Last frame of a 100-frame video: frames 100 and 101 were never extracted.
    show('labeled-data/s/img00000099.png');
    images()[3].dispatchEvent(new Event('error'));
    images()[4].dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(images().map((img) => img.getAttribute('src'))).toEqual([
      FILES + 'labeled-data/s/img00000097.png',
      FILES + 'labeled-data/s/img00000098.png',
      FILES + 'labeled-data/s/img00000099.png',
      FILES + 'labeled-data/s/img00000099.png',
      FILES + 'labeled-data/s/img00000099.png',
    ]);
    viewOptions.jumpToTemporalContextSlot(4);
    fixture.detectChanges();
    expect(visibleSrcs()).toEqual([FILES + 'labeled-data/s/img00000099.png']);
  });

  describe('contextFramesMissing', () => {
    function fail(...slots: number[]) {
      for (const slot of slots) {
        images()[slot].dispatchEvent(new Event('error'));
      }
      fixture.detectChanges();
    }

    it('is false until the context frames fail to load', () => {
      show('labeled-data/s/img00000042.png');
      expect(fixture.componentInstance.contextFramesMissing()).toBeFalse();
    });

    it('is true when every frame other than the current one fails to load', () => {
      show('labeled-data/s/img00000042.png');
      fail(0, 1, 3);
      expect(fixture.componentInstance.contextFramesMissing()).toBeFalse();
      fail(4);
      expect(fixture.componentInstance.contextFramesMissing()).toBeTrue();
    });

    it('is true at frame 0 when frames 1 and 2 fail to load', () => {
      show('labeled-data/s/img00000000.png');
      fail(3, 4);
      expect(fixture.componentInstance.contextFramesMissing()).toBeTrue();
    });

    it('is false at the end of a video, where only later frames are missing', () => {
      show('labeled-data/s/img00000099.png');
      fail(3, 4);
      expect(fixture.componentInstance.contextFramesMissing()).toBeFalse();
    });

    it('is false when the file name has no frame number', () => {
      show('labeled-data/s/frame_a.png');
      fail(0);
      expect(fixture.componentInstance.contextFramesMissing()).toBeFalse();
    });
  });

  describe('contextSlotViews', () => {
    function fail(...slots: number[]) {
      for (const slot of slots) {
        images()[slot].dispatchEvent(new Event('error'));
      }
      fixture.detectChanges();
    }

    it('marks slots before the start of the video and the frame they show', () => {
      show('labeled-data/s/img00000001.png');
      expect(fixture.componentInstance.contextSlotViews()).toEqual([
        { shownOffset: -1, substitute: 'before-start' },
        { shownOffset: -1, substitute: null },
        { shownOffset: 0, substitute: null },
        { shownOffset: 1, substitute: null },
        { shownOffset: 2, substitute: null },
      ]);
    });

    it('marks a slot whose frame was not found as showing the current frame', () => {
      show('labeled-data/s/img00000099.png');
      fail(4);
      expect(fixture.componentInstance.contextSlotViews()![4]).toEqual({
        shownOffset: 0,
        substitute: 'not-found',
      });
      expect(fixture.componentInstance.contextSlotViews()![3]).toEqual({
        shownOffset: 1,
        substitute: null,
      });
    });

    it('is null without a frame number', () => {
      show('labeled-data/s/frame_a.png');
      expect(fixture.componentInstance.contextSlotViews()).toBeNull();
    });
  });

  describe('currentFrameMissing', () => {
    it('is true only when the current frame fails to load', () => {
      show('labeled-data/s/img00000042.png');
      images()[4].dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(fixture.componentInstance.currentFrameMissing()).toBeFalse();
      images()[2].dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(fixture.componentInstance.currentFrameMissing()).toBeTrue();
    });
  });

  it('tries failed images again when the frame is opened again', () => {
    show('labeled-data/s/img00000042.png');
    for (const slot of [0, 1, 3, 4]) {
      images()[slot].dispatchEvent(new Event('error'));
    }
    fixture.detectChanges();
    expect(fixture.componentInstance.contextFramesMissing()).toBeTrue();

    show('labeled-data/s/img00000050.png');
    show('labeled-data/s/img00000042.png');
    expect(fixture.componentInstance.contextFramesMissing()).toBeFalse();
    expect(images()[4].getAttribute('src')).toBe(
      FILES + 'labeled-data/s/img00000044.png',
    );
  });
});
