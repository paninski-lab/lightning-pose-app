import {
  computed,
  effect,
  Injectable,
  Signal,
  signal,
  untracked,
} from '@angular/core';
import { VideoTileComponent } from './video-tile/video-tile.component';
import {
  animationFrameScheduler,
  BehaviorSubject,
  map,
  Subscription,
  take,
  timer,
} from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Monolith for controlling multiple video players and the time slider component.
 *
 * Seeking: Current time changes flow to subcomponents.
 * Regular playback: One video player controls the current time, syncs to the rest which are paused.
 */
@Injectable()
export class VideoPlayerState {
  currentTime = new BehaviorSubject<number>(0);
  isPlaying = new BehaviorSubject<boolean>(false);

  currentTimeSignal: Signal<number>;
  currentFrameSignal: Signal<number>;
  isPlayingSignal: Signal<boolean>;

  duration = signal<number>(0);
  fps = signal<number>(30);

  private videoPlayers: VideoTileComponent[] = [];

  // during playback, the animation frame subscription that syncs currentTime.
  private syncSubscription: Subscription | null = null;

  constructor() {
    this.isPlayingSignal = toSignal(this.isPlaying, { requireSync: true });
    this.currentTimeSignal = toSignal(this.currentTime, { requireSync: true });
    // TODO replace 300 with framerate.
    this.currentFrameSignal = computed(() =>
      Math.round(this.currentTimeSignal() * this.fps()),
    );

    // Setup play, pause, seek handling.

    effect(() => {
      // When isPlaying changes...
      const isPlaying = this.isPlayingSignal();
      untracked(() => {
        if (isPlaying) {
          this.onPlay();
        } else {
          this.onPause();
        }
      });
    });

    effect(() => {
      // When current time changes, while isPlaying is false...
      this.currentTimeSignal();

      untracked(() => {
        if (!this.isPlayingSignal()) {
          this.onSeek();
        }
      });
    });
  }

  reset() {
    this.isPlaying.next(false);
    this.currentTime.next(0);
    this.duration.set(0);
  }

  registerVideoPlayer(videoPlayer: VideoTileComponent) {
    this.videoPlayers.push(videoPlayer);
  }

  unregisterVideoPlayer(videoPlayer: VideoTileComponent) {
    const i = this.videoPlayers.indexOf(videoPlayer);
    this.videoPlayers.splice(i, 1);
  }

  private onPlay() {
    // Sync the start timestamp for all video players before playing
    this.videoPlayers.forEach((videoPlayer) => {
      const el = videoPlayer.videoElement?.nativeElement;
      if (el) {
        el.currentTime = this.currentTime.value;
      }
    });
    // Call play on all video elements.
    // Hope they stay in sync.
    this.videoPlayers.forEach((videoPlayer) => {
      videoPlayer.videoElement?.nativeElement.play();
    });
    this.startSyncObservable();
  }

  private onPause() {
    // Pause, then sync their currentTimestamp just
    // in case there was any drift.
    this.stopSyncObservable();
    this.videoPlayers.forEach((videoPlayer) => {
      videoPlayer.videoElement?.nativeElement.pause();
    });
    this.videoPlayers.forEach((videoPlayer) => {
      const el = videoPlayer.videoElement?.nativeElement;
      if (el) {
        el.currentTime = this.currentTime.value;
      }
    });
  }

  private onSeek() {
    // only called while players are paused.

    // sync currentTime across all paused elements
    this.videoPlayers.forEach((videoPlayer) => {
      const el = videoPlayer.videoElement?.nativeElement;
      if (!el) return;
      el.currentTime = this.currentTimeSignal();
    });
  }

  private startSyncObservable() {
    if (this.videoPlayers.length === 0) return;
    const primaryPlayer = this.videoPlayers[0];

    // Sync `currentTime` with `requestAnimationFrame`
    this.syncSubscription = timer(0, 0, animationFrameScheduler)
      .pipe(
        map(() => {
          const el = primaryPlayer.videoElement?.nativeElement;
          return el ? el.currentTime : null;
        }),
      )
      .subscribe((time) => {
        if (time !== null) {
          this.currentTime.next(time); // Update BehaviorSubject
        }
      });
    /*
    // If content ends while playing, we should update our state appropriately.
    const contentEndSubscription = primaryPlayer.contentEnd.pipe(take(1)).subscribe(() => {
      if (this.isPlaying.value) {

        this.isPlaying.next(false);
      }
    });
    // Unsubscribe contentEndSubscription when the sync subsubscription ends.
    this.syncSubscription.add(contentEndSubscription);
    */
  }

  private stopSyncObservable() {
    // Unsubscribe from the current sync subscription if it exists
    if (this.syncSubscription) {
      this.syncSubscription.unsubscribe();
      this.syncSubscription = null;
    }
  }
}
