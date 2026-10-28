import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ColorService } from '../infra/color.service';
import { debounceTime, merge } from 'rxjs';
import {
  DEFAULT_SKELETON_OPACITY,
  DEFAULT_SKELETON_THICKNESS,
} from '../components/skeleton-overlay/skeleton-validity';
import {
  storedFlag,
  storedNumber,
  storedSkeletonThickness,
} from '../components/skeleton-overlay/stored-number';
import {
  CONTEXT_CENTER_INDEX,
  playContextSlot,
  stepContextSlot,
} from './temporal-context';

const DEFAULT_BRIGHTNESS = 1;
const DEFAULT_CONTRAST = 1;
const DEFAULT_IMAGE_SIZE = 500;
const UMAMI_DEBOUNCE_TIME_MS = 10000;
const TEMPORAL_CONTEXT_PLAY_INTERVAL_MS = 300;

@Injectable()
/** Scoped service holding per-session labeler display options, persisted to localStorage. */
export class LabelerViewOptionsService {
  private colorService = inject(ColorService);
  private destroyRef = inject(DestroyRef);
  /** True while temporal context plays through the five context frames. */
  isPlayingTemporalContext = signal(false);
  /** Visible context slot, 0 … 4 (n-2 … n+2). Slot 2 is the current frame. */
  temporalContextIndex = signal(CONTEXT_CENTER_INDEX);
  /** True when the image shown is not the still current frame, so keypoints are hidden. */
  isShowingTemporalContext = computed(
    () =>
      this.isPlayingTemporalContext() ||
      this.temporalContextIndex() !== CONTEXT_CENTER_INDEX,
  );

  imgBrightnessScalar = signal(DEFAULT_BRIGHTNESS);
  imgContrastScalar = signal(DEFAULT_CONTRAST);
  imageSizePx = signal(
    Number(localStorage.getItem('labeler-view-options.image-size')) ||
      DEFAULT_IMAGE_SIZE,
  );
  keypointOpacity = signal(
    Number(localStorage.getItem('labeler-view-options.opacity')) ||
      this.colorService.defaultOpacity,
  );
  keypointSize = signal(
    Number(localStorage.getItem('labeler-view-options.size')) ||
      this.colorService.defaultSize,
  );
  keypointLabelFontSize = signal(
    Number(localStorage.getItem('labeler-view-options.labelFontSize')) || 8,
  );
  isBrightnessDefault = computed(
    () => this.imgBrightnessScalar() === DEFAULT_BRIGHTNESS,
  );
  isImageSizeDefault = computed(
    () => this.imageSizePx() === DEFAULT_IMAGE_SIZE,
  );
  isContrastDefault = computed(
    () => this.imgContrastScalar() === DEFAULT_CONTRAST,
  );
  isOpacityDefault = computed(
    () => this.keypointOpacity() === this.colorService.defaultOpacity,
  );
  isSizeDefault = computed(
    () => this.keypointSize() === this.colorService.defaultSize,
  );
  isLabelFontSizeDefault = computed(() => this.keypointLabelFontSize() === 8);
  enableKeypointLabels = signal(true);
  showSkeleton = signal(
    storedFlag('labeler-view-options.showSkeleton', true),
  );
  skeletonThickness = signal(
    storedSkeletonThickness('labeler-view-options.skeletonThickness'),
  );
  skeletonOpacity = signal(
    storedNumber(
      'labeler-view-options.skeletonOpacity',
      DEFAULT_SKELETON_OPACITY,
    ),
  );
  /** Show each slider's value under it in View options. */
  showSliderNumbers = signal(
    storedFlag('labeler-view-options.showSliderNumbers', false),
  );
  isSkeletonThicknessDefault = computed(
    () => this.skeletonThickness() === DEFAULT_SKELETON_THICKNESS,
  );
  isSkeletonOpacityDefault = computed(
    () => this.skeletonOpacity() === DEFAULT_SKELETON_OPACITY,
  );

  imgCssFilterString = computed(() => {
    return `brightness(${this.imgBrightnessScalar()}) contrast(${this.imgContrastScalar()})`;
  });
  enablePixelGrid = signal(false);
  /** Keep the selected keypoint when the view or frame changes, instead of selecting the first one. */
  keepSelectedKeypoint = signal(
    storedFlag('labeler-view-options.keepSelectedKeypoint', false),
  );

  constructor() {
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.image-size',
        String(this.imageSizePx()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.opacity',
        String(this.keypointOpacity()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.size',
        String(this.keypointSize()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.labelFontSize',
        String(this.keypointLabelFontSize()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.showSkeleton',
        String(this.showSkeleton()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.skeletonThickness',
        String(this.skeletonThickness()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.skeletonOpacity',
        String(this.skeletonOpacity()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.showSliderNumbers',
        String(this.showSliderNumbers()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        'labeler-view-options.keepSelectedKeypoint',
        String(this.keepSelectedKeypoint()),
      ),
    );

    merge(
      toObservable(this.imageSizePx),
      toObservable(this.imgBrightnessScalar),
      toObservable(this.imgContrastScalar),
      toObservable(this.keypointOpacity),
      toObservable(this.keypointSize),
      toObservable(this.keypointLabelFontSize),
      toObservable(this.enableKeypointLabels),
      toObservable(this.enablePixelGrid),
      toObservable(this.showSkeleton),
      toObservable(this.skeletonThickness),
      toObservable(this.skeletonOpacity),
      toObservable(this.showSliderNumbers),
      toObservable(this.keepSelectedKeypoint),
    )
      .pipe(
        debounceTime(UMAMI_DEBOUNCE_TIME_MS),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        window.umami?.track('labeler_view_options_change', {
          imageSizePx: this.imageSizePx(),
          imgBrightnessScalar: this.imgBrightnessScalar(),
          imgContrastScalar: this.imgContrastScalar(),
          keypointOpacity: this.keypointOpacity(),
          keypointSize: this.keypointSize(),
          keypointLabelFontSize: this.keypointLabelFontSize(),
          enableKeypointLabels: this.enableKeypointLabels(),
          enablePixelGrid: this.enablePixelGrid(),
          showSkeleton: this.showSkeleton(),
          skeletonThickness: this.skeletonThickness(),
          skeletonOpacity: this.skeletonOpacity(),
          showSliderNumbers: this.showSliderNumbers(),
          keepSelectedKeypoint: this.keepSelectedKeypoint(),
        });
      });

    this.destroyRef.onDestroy(() => this.stopPlayTimer());
  }

  /** Reset keypoint size to the ColorService default. */
  resetKeypointSize() {
    this.keypointSize.set(this.colorService.defaultSize);
  }

  /** Reset keypoint label font size to 8px. */
  resetLabelFontSize() {
    this.keypointLabelFontSize.set(8);
  }

  resetSkeletonThickness() {
    this.skeletonThickness.set(DEFAULT_SKELETON_THICKNESS);
  }

  resetSkeletonOpacity() {
    this.skeletonOpacity.set(DEFAULT_SKELETON_OPACITY);
  }

  /** Reset the labeled frame viewport to 500px. */
  resetImageSize() {
    this.imageSizePx.set(DEFAULT_IMAGE_SIZE);
  }

  /** Reset image brightness to 1 (no adjustment). */
  resetBrightness() {
    this.imgBrightnessScalar.set(DEFAULT_BRIGHTNESS);
  }

  /** Reset image contrast to 1 (no adjustment). */
  resetContrast() {
    this.imgContrastScalar.set(DEFAULT_CONTRAST);
  }

  /** Reset keypoint opacity to the ColorService default. */
  resetOpacity() {
    this.keypointOpacity.set(this.colorService.defaultOpacity);
  }

  private playTimer: ReturnType<typeof setInterval> | undefined;
  private playDirection: 1 | -1 = 1;

  /** Play through the context frames (−2 … +2 and back) from the visible slot. */
  playTemporalContext() {
    if (this.isPlayingTemporalContext()) return;
    this.isPlayingTemporalContext.set(true);
    this.playTimer = setInterval(() => {
      const next = playContextSlot(
        this.temporalContextIndex(),
        this.playDirection,
      );
      this.playDirection = next.direction;
      this.temporalContextIndex.set(next.slot);
    }, TEMPORAL_CONTEXT_PLAY_INTERVAL_MS);
  }

  /** Hold the visible context frame. */
  pauseTemporalContext() {
    this.stopPlayTimer();
    this.isPlayingTemporalContext.set(false);
  }

  toggleTemporalContextPlayback() {
    if (this.isPlayingTemporalContext()) this.pauseTemporalContext();
    else this.playTemporalContext();
  }

  /** Pause and move one context frame back (-1) or forward (+1). */
  stepTemporalContext(delta: -1 | 1) {
    this.pauseTemporalContext();
    this.temporalContextIndex.update((slot) => stepContextSlot(slot, delta));
  }

  /** Pause on a context slot (0 … 4). */
  jumpToTemporalContextSlot(slot: number) {
    this.pauseTemporalContext();
    this.temporalContextIndex.set(stepContextSlot(slot, 0));
  }

  /** Pause on the current frame, with keypoints shown. */
  resetTemporalContext() {
    this.jumpToTemporalContextSlot(CONTEXT_CENTER_INDEX);
    this.playDirection = 1;
  }

  private stopPlayTimer() {
    clearInterval(this.playTimer);
    this.playTimer = undefined;
  }
}
