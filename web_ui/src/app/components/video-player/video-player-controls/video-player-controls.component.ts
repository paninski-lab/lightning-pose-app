import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { VideoPlayerState } from '../video-player-state';
import { animationFrameScheduler, BehaviorSubject, throttleTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-video-player-controls',
  imports: [],
  templateUrl: './video-player-controls.component.html',
  styleUrl: './video-player-controls.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayerControlsComponent {
  // the main state, injected from parent so it can be easily shared across video players
  videoPlayerState: VideoPlayerState = inject(VideoPlayerState);

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
  get currentFrame() {
    return this.videoPlayerState.currentFrameSignal;
  }

  protected get duration() {
    return this.videoPlayerState.duration;
  }
  protected get fps() {
    return this.videoPlayerState.fps;
  }

  protected step = computed(() => 1 / this.fps());

  toggleIsPlaying() {
    this.videoPlayerState.isPlaying.next(!this.isPlaying());
  }

  onSliderInput(newValue: any) {
    // deduplicate? if already not playing.
    this.videoPlayerState.isPlaying.next(false);
    this.sliderEventSubject.next(newValue);
  }
}
