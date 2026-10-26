import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabelerViewOptionsService } from '../labeler-view-options.service';
import { KeypointContainerComponent } from '../../keypoint-container/keypoint-container.component';
import { ZoomableContentComponent } from '../../zoomable-content.component';
import { FrameView } from '../frame.model';
import { LKeypoint, lkp } from '../types';
import { Keypoint } from '../../keypoint';
import { ProjectInfoService } from '../../project-info.service';
import { Point } from '@angular/cdk/drag-drop';
import { ColorService } from '../../infra/color.service';
import {
  isSkeletonDefinitionInvalid,
  skeletonPairs,
} from '../../components/skeleton-overlay/skeleton-validity';
import { fittedMediaHeight } from '../../fitted-media-height';
import {
  CONTEXT_CENTER_INDEX,
  ContextSlotView,
  contextFrameOffsets,
  contextImgPaths,
} from '../temporal-context';

@Component({
  selector: 'app-image-label-widget',
  standalone: true,
  imports: [CommonModule, KeypointContainerComponent, ZoomableContentComponent],
  templateUrl: './image-label-widget.component.html',
  styles: '',
  host: {
    '[style.height.px]': 'tileHeight()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageLabelWidgetComponent {
  private projectInfoService = inject(ProjectInfoService);
  protected viewOptions = inject(LabelerViewOptionsService);
  private colorService = inject(ColorService);

  fv = input.required<FrameView>();
  /** Bumped when keypoints are replaced in place so OnPush redraws markers. */
  revision = input(0);
  selectedKeypoint = model<string | null>(null);
  disableInteractions = input<boolean>(false);
  zoomableInteractivityDisabled = input<boolean>(false);

  keypointUpdated = output<{
    kp: string;
    position: Point;
  }>();

  private keypointViewModelCache = new WeakMap<LKeypoint[], Keypoint[]>();

  zoomableContent = viewChild<ZoomableContentComponent>('primaryZoomable');
  private frameImages = viewChildren<ElementRef<HTMLImageElement>>('frameImage');
  /** src of the image whose pixel size we last measured. */
  private loadedSize = signal<{ src: string; w: number; h: number } | null>(
    null,
  );

  /** Width comes from the parent. Height follows the image until a size class overrides it. */
  protected tileHeight = computed(() => {
    const size = this.viewOptions.imageSizePx();
    const loaded = this.loadedSize();
    const srcs = this.contextSrcs();
    // img.src is an absolute URL; the template binds the app path.
    const measured = loaded
      ? srcs.some(
          (src) => loaded.src === src || loaded.src.endsWith(src),
        )
      : false;
    if (!measured || !loaded) return size;
    return fittedMediaHeight(size, loaded.w, loaded.h);
  });

  constructor() {
    // Cached images can finish loading before the (load) listener exists.
    effect(() => {
      const imgs = this.frameImages();
      for (const ref of imgs) {
        const img = ref.nativeElement;
        if (img.complete && img.naturalWidth > 0) {
          this.rememberImageSize(img);
          return;
        }
      }
    });
  }

  protected onImageLoad(event: Event) {
    const img = event.target;
    if (img instanceof HTMLImageElement) this.rememberImageSize(img);
  }

  private rememberImageSize(img: HTMLImageElement) {
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
    const src = img.currentSrc || img.src;
    const loaded = this.loadedSize();
    if (
      loaded &&
      loaded.src === src &&
      loaded.w === img.naturalWidth &&
      loaded.h === img.naturalHeight
    ) {
      return;
    }
    this.loadedSize.set({
      src,
      w: img.naturalWidth,
      h: img.naturalHeight,
    });
  }

  protected drawableSkeletonPairs = computed(() => {
    const info = this.projectInfoService.projectContext()?.projectInfo;
    if (!info || isSkeletonDefinitionInvalid(info.skeleton, info.keypoint_names)) {
      return [] as [string, string][];
    }
    return skeletonPairs(info.skeleton);
  });

  protected get labelerDefaultsToEditMode(): boolean {
    const frameView = this.fv();
    const selectedKeypoint = this.selectedKeypoint();
    if (!selectedKeypoint) return false;
    const selectedKeypointInFrame = frameView.keypoints.find(
      (kp) => kp.keypointName === selectedKeypoint,
    );
    if (!selectedKeypointInFrame) return false;

    return lkp(selectedKeypointInFrame).isNaN();
  }

  protected getCachedKeypointViewModels(keypoints: LKeypoint[]): Keypoint[] {
    this.revision();
    if (!this.keypointViewModelCache.has(keypoints)) {
      const target = keypoints
        .map((k) => this.buildViewModel(k))
        .filter(
          (keypoint) =>
            !isNaN(keypoint.position().x) && !isNaN(keypoint.position().y),
        );
      this.keypointViewModelCache.set(keypoints, target);
    }
    return this.keypointViewModelCache.get(keypoints)!;
  }

  private buildViewModel(lkeypoint: LKeypoint): Keypoint {
    const val = {
      id: lkeypoint.keypointName,
      hoverText: signal(lkeypoint.keypointName),
      position: signal({ x: lkeypoint.x, y: lkeypoint.y }),
      color: computed(() => this.colorService.defaultColor),
    };
    return val;
  }

  protected imgPath(kpImgPath: string): string {
    return (
      '/app/v0/files/' +
      this.projectInfoService.projectInfo.data_dir +
      '/' +
      kpImgPath
    );
  }

  /** src of the current frame. */
  private centerSrc = computed(() => this.imgPath(this.fv().imgPath));

  /**
   * Image srcs that failed to load (for example past the end of the video).
   * Cleared when another frame opens, so reopening a frame tries again.
   */
  private missingSrcs = linkedSignal<string, ReadonlySet<string>>({
    source: () => this.fv().imgPath,
    computation: () => new Set(),
  });

  /**
   * Five context frames, n-2 … n+2, built as lightning-pose does. A frame that
   * fails to load shows the current frame, as in LP training. A file name with
   * no frame number has no context: just the current frame.
   */
  protected contextSrcs = computed((): string[] => {
    const paths = contextImgPaths(this.fv().imgPath);
    if (!paths) return [this.centerSrc()];
    const missing = this.missingSrcs();
    return paths
      .map((p) => this.imgPath(p))
      .map((src) => (missing.has(src) ? this.centerSrc() : src));
  });

  /** Slot shown: the temporal context slot (the current frame unless context is in use). */
  protected visibleSlot = computed(() =>
    this.contextSrcs().length === 1 ? 0 : this.viewOptions.temporalContextIndex(),
  );

  /**
   * True once every context frame other than the current one has failed to
   * load, so there is no context to show (for example imported frames that
   * were extracted without their neighbors).
   */
  contextFramesMissing = computed(() => {
    const paths = contextImgPaths(this.fv().imgPath);
    if (!paths) return false;
    const center = this.centerSrc();
    const missing = this.missingSrcs();
    return paths
      .map((p) => this.imgPath(p))
      .filter((src) => src !== center)
      .every((src) => missing.has(src));
  });

  /** True when the current frame's own image failed to load. */
  currentFrameMissing = computed(() =>
    this.missingSrcs().has(this.centerSrc()),
  );

  /**
   * What each context slot actually shows: its own frame, frame 0 for a slot
   * before the start of the video, or the current frame for a frame that was
   * not found. Null without a frame number.
   */
  contextSlotViews = computed((): ContextSlotView[] | null => {
    const paths = contextImgPaths(this.fv().imgPath);
    const offsets = contextFrameOffsets(this.fv().imgPath);
    if (!paths || !offsets) return null;
    const missing = this.missingSrcs();
    return paths.map((p, slot) => {
      const src = this.imgPath(p);
      if (src !== this.centerSrc() && missing.has(src)) {
        return { shownOffset: 0, substitute: 'not-found' };
      }
      const ownOffset = slot - CONTEXT_CENTER_INDEX;
      return offsets[slot] === ownOffset
        ? { shownOffset: ownOffset, substitute: null }
        : { shownOffset: offsets[slot], substitute: 'before-start' };
    });
  });

  protected onImageError(src: string) {
    if (this.missingSrcs().has(src)) return;
    this.missingSrcs.update((set) => new Set(set).add(src));
  }

  protected handleKeypointUpdated(keypointName: string, position: Point) {
    this.keypointUpdated.emit({ kp: keypointName, position });
  }
}
