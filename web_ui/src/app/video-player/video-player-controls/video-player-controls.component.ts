import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { VideoPlayerState, PLAYBACK_RATE_OPTIONS } from '../video-player-state';
import { viewerPlaybackActionFromKeyboard } from '../video-player-keyboard';
import { animationFrameScheduler, BehaviorSubject, throttleTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../../components/dropdown/dropdown.component';

/** Decimal places shown for time. Jump entry rounds to this precision. */
export const TIME_DISPLAY_DECIMALS = 2;

export function parseFrameJump(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.floor(value);
}

export function parseTimeJump(
  raw: string,
  decimals = TIME_DISPLAY_DECIMALS,
): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

@Component({
  selector: 'app-video-player-controls',
  imports: [
    DropdownComponent,
    DropdownContentComponent,
    DropdownTriggerComponent,
    DropdownTriggerDirective,
  ],
  templateUrl: './video-player-controls.component.html',
  styleUrl: './video-player-controls.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class VideoPlayerControlsComponent {
  // the main state, injected from parent so it can be easily components across video players
  videoPlayerState: VideoPlayerState = inject(VideoPlayerState);

  protected readonly playbackRateOptions = PLAYBACK_RATE_OPTIONS;
  extractFrame = output<void>();
  private rangeInput = viewChild<ElementRef<HTMLInputElement>>('rangeInput');
  private frameDraft = signal<string | null>(null);
  private timeDraft = signal<string | null>(null);
  private revertingJump = false;

  private sliderEventSubject = new BehaviorSubject<number>(0);

  constructor() {
    this.sliderEventSubject
      .pipe(
        takeUntilDestroyed(),
        throttleTime(0, animationFrameScheduler, {
          leading: true,
          trailing: true,
        }),
      )
      .subscribe((newValue) => this.applySliderTime(newValue));
  }

  // convenience getters
  get isPlaying() {
    return this.videoPlayerState.isPlayingSignal;
  }

  get currentTime() {
    return this.videoPlayerState.currentTimeSignal;
  }
  protected currentTimeFormatted = computed(() =>
    this.videoPlayerState.currentTimeSignal().toFixed(TIME_DISPLAY_DECIMALS),
  );
  protected durationFormatted = computed(() =>
    this.duration().toFixed(TIME_DISPLAY_DECIMALS),
  );
  protected frameFieldValue = computed(
    () => this.frameDraft() ?? String(this.currentFrame()),
  );
  protected timeFieldValue = computed(
    () => this.timeDraft() ?? this.currentTimeFormatted(),
  );
  get currentFrame() {
    return this.videoPlayerState.currentFrameSignal;
  }

  protected get duration() {
    return this.videoPlayerState.duration;
  }
  protected get fps() {
    return this.videoPlayerState.fps;
  }
  protected get playbackRate() {
    return this.videoPlayerState.playbackRate;
  }
  protected hasVideo = computed(() => this.duration() > 0);
  /** End of the track is the last real frame, not t === duration. */
  protected sliderMax = computed(() => {
    const fps = this.fps();
    if (fps <= 0) return 0;
    return this.videoPlayerState.lastFrameSignal() / fps;
  });
  protected playbackRateLabel = computed(() => {
    const rate = this.playbackRate();
    return (
      PLAYBACK_RATE_OPTIONS.find((option) => option.rate === rate)?.label ??
      '1x'
    );
  });

  protected step = computed(() => {
    const fps = this.fps();
    return fps > 0 ? 1 / fps : 0.001;
  });

  onSliderInput(newValue: string) {
    this.videoPlayerState.isPlaying.next(false);
    this.sliderEventSubject.next(Number(newValue));
  }

  /** Mouseup / keyboard commit: apply the native value immediately (bypass throttle). */
  onSliderChange(newValue: string) {
    const time = Number(newValue);
    this.applySliderTime(time);
    this.sliderEventSubject.next(time);
    this.rangeInput()?.nativeElement.blur();
  }

  private applySliderTime(raw: number) {
    this.videoPlayerState.isPlaying.next(false);
    const fps = this.fps();
    const maxTime = fps > 0 ? this.videoPlayerState.lastFrameSignal() / fps : 0;
    const time = Math.min(Math.max(Number(raw) || 0, 0), maxTime);
    this.videoPlayerState.currentTime.next(time);
  }

  protected onFrameFocus(event: FocusEvent) {
    const input = event.target as HTMLInputElement;
    this.frameDraft.set(input.value);
    input.select();
  }

  protected onFrameInput(value: string) {
    this.frameDraft.set(value);
  }

  protected onFrameEnter(event: Event) {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    this.commitFrame(input.value);
    input.blur();
  }

  protected onFrameEscape(event: Event) {
    event.preventDefault();
    this.revertingJump = true;
    this.frameDraft.set(null);
    const input = event.target as HTMLInputElement;
    input.value = String(this.currentFrame());
    input.blur();
  }

  protected onFrameBlur(event: FocusEvent) {
    if (this.revertingJump) {
      this.revertingJump = false;
      this.frameDraft.set(null);
      return;
    }
    this.commitFrame((event.target as HTMLInputElement).value);
  }

  protected onTimeFocus(event: FocusEvent) {
    const input = event.target as HTMLInputElement;
    this.timeDraft.set(input.value);
    input.select();
  }

  protected onTimeInput(value: string) {
    this.timeDraft.set(value);
  }

  protected onTimeEnter(event: Event) {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    this.commitTime(input.value);
    input.blur();
  }

  protected onTimeEscape(event: Event) {
    event.preventDefault();
    this.revertingJump = true;
    this.timeDraft.set(null);
    const input = event.target as HTMLInputElement;
    input.value = this.currentTimeFormatted();
    input.blur();
  }

  protected onTimeBlur(event: FocusEvent) {
    if (this.revertingJump) {
      this.revertingJump = false;
      this.timeDraft.set(null);
      return;
    }
    this.commitTime((event.target as HTMLInputElement).value);
  }

  private commitFrame(raw: string) {
    this.frameDraft.set(null);
    const parsed = parseFrameJump(raw);
    if (parsed == null || !this.hasVideo()) return;
    this.videoPlayerState.seekToFrame(parsed);
  }

  private commitTime(raw: string) {
    this.timeDraft.set(null);
    const parsed = parseTimeJump(raw);
    if (parsed == null || !this.hasVideo()) return;
    const time = Math.min(Math.max(parsed, 0), this.sliderMax());
    const fps = this.fps();
    this.videoPlayerState.seekToFrame(fps > 0 ? Math.round(time * fps) : 0);
  }

  protected onStepFrameClick(event: MouseEvent, direction: -1 | 1) {
    event.preventDefault();
    this.videoPlayerState.stepFrame(event.shiftKey ? direction * 10 : direction);
  }

  protected onDocumentKeydown(event: KeyboardEvent) {
    const action = viewerPlaybackActionFromKeyboard(event);
    if (!action) return;
    if (!this.hasVideo()) return;

    event.preventDefault();
    switch (action.type) {
      case 'togglePlay':
        this.videoPlayerState.toggleIsPlaying();
        break;
      case 'stepFrame':
        this.videoPlayerState.stepFrame(action.delta);
        break;
      case 'seekToStart':
        this.videoPlayerState.seekToStart();
        break;
      case 'seekToEnd':
        this.videoPlayerState.seekToEnd();
        break;
      case 'nudgeRate':
        this.videoPlayerState.nudgePlaybackRate(action.direction);
        break;
      case 'extractFrame':
        this.extractFrame.emit();
        break;
    }
  }
}
