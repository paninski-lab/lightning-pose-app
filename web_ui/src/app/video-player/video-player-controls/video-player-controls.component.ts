import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
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

  private sliderEventSubject = new BehaviorSubject<number>(0);

  constructor() {
    this.sliderEventSubject
      .pipe(takeUntilDestroyed())
      .pipe(throttleTime(0, animationFrameScheduler))
      // Further throttle updates to 30fps. Use trailing: true? Idk.
      .pipe(throttleTime(1000 / 30, undefined))
      .subscribe((newValue) => {
        this.videoPlayerState.currentTime.next(Number(newValue));
      });
  }

  // convenience getters
  get isPlaying() {
    return this.videoPlayerState.isPlayingSignal;
  }

  get currentTime() {
    return this.videoPlayerState.currentTimeSignal;
  }
  protected currentTimeFormatted = computed(() =>
    this.videoPlayerState.currentTimeSignal().toFixed(2),
  );
  protected durationFormatted = computed(() => this.duration().toFixed(2));
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

  onSliderInput(newValue: any) {
    // deduplicate? if already not playing.
    this.videoPlayerState.isPlaying.next(false);
    this.sliderEventSubject.next(newValue);
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
    }
  }
}
