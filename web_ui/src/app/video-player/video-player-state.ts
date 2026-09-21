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
  timer,
} from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

/** Slowest → fastest. Nothing faster than real time. */
export const PLAYBACK_RATES = [0.0625, 0.125, 0.25, 0.5, 1] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const PLAYBACK_RATE_OPTIONS: { rate: PlaybackRate; label: string }[] = [
  { rate: 1, label: '1x' },
  { rate: 0.5, label: '1/2x' },
  { rate: 0.25, label: '1/4x' },
  { rate: 0.125, label: '1/8x' },
  { rate: 0.0625, label: '1/16x' },
];

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
  lastFrameSignal: Signal<number>;

  duration = signal<number>(0);
  fps = signal<number>(30);
  playbackRate = signal<PlaybackRate>(1);

  private videoPlayers: VideoTileComponent[] = [];

  // during playback, the animation frame subscription that syncs currentTime.
  private syncSubscription: Subscription | null = null;

  /** Latest frame requested by step/jump while a video seek is in flight. */
  private pendingFrame: number | null = null;
  private seeking = false;
  private seekedListener: (() => void) | null = null;
  private seekTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.isPlayingSignal = toSignal(this.isPlaying, { requireSync: true });
    this.currentTimeSignal = toSignal(this.currentTime, { requireSync: true });
    this.currentFrameSignal = computed(() =>
      Math.round(this.currentTimeSignal() * this.fps()),
    );
    this.lastFrameSignal = computed(() => {
      const fps = this.fps();
      const duration = this.duration();
      if (fps <= 0 || duration <= 0) return 0;
      return Math.max(0, Math.round(duration * fps) - 1);
    });

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

    effect(() => {
      const rate = this.playbackRate();
      untracked(() => this.applyPlaybackRateToPlayers(rate));
    });
  }

  reset() {
    this.clearSeekWait();
    this.isPlaying.next(false);
    this.currentTime.next(0);
    this.duration.set(0);
    this.playbackRate.set(1);
  }

  registerVideoPlayer(videoPlayer: VideoTileComponent) {
    this.videoPlayers.push(videoPlayer);
    this.applyPlaybackRateToPlayers(this.playbackRate());
  }

  unregisterVideoPlayer(videoPlayer: VideoTileComponent) {
    const i = this.videoPlayers.indexOf(videoPlayer);
    if (i === 0) this.clearSeekWait();
    this.videoPlayers.splice(i, 1);
  }

  toggleIsPlaying() {
    if (this.duration() <= 0) return;
    this.isPlaying.next(!this.isPlaying.value);
  }

  stepFrame(delta: number) {
    if (!this.canSeek()) return;
    const base =
      this.pendingFrame != null
        ? this.pendingFrame
        : this.currentFrameSignal();
    const nextFrame = Math.min(
      Math.max(base + delta, 0),
      this.lastFrameSignal(),
    );
    this.seekToFrame(nextFrame);
  }

  seekToStart() {
    if (!this.canSeek()) return;
    this.seekToFrame(0);
  }

  seekToEnd() {
    if (!this.canSeek()) return;
    this.seekToFrame(this.lastFrameSignal());
  }

  setPlaybackRate(rate: number) {
    if (!isPlaybackRate(rate)) return;
    this.playbackRate.set(rate);
  }

  nudgePlaybackRate(direction: -1 | 1) {
    const index = PLAYBACK_RATES.indexOf(this.playbackRate());
    const nextIndex = Math.min(
      Math.max((index === -1 ? PLAYBACK_RATES.length - 1 : index) + direction, 0),
      PLAYBACK_RATES.length - 1,
    );
    this.playbackRate.set(PLAYBACK_RATES[nextIndex]);
  }

  applyPlaybackRateToElement(el: HTMLVideoElement | null | undefined) {
    if (!el) return;
    el.playbackRate = this.playbackRate();
  }

  private canSeek() {
    return this.duration() > 0 && this.fps() > 0;
  }

  private primaryVideo(): HTMLVideoElement | null {
    const el = this.videoPlayers[0]?.videoElement?.nativeElement as
      | HTMLVideoElement
      | undefined;
    return el ?? null;
  }

  /**
   * Seek the videos first, then publish `currentTime` (keypoints, frame
   * readout) on `seeked` so the overlay does not race ahead of the picture.
   * Key-hold steps coalesce the next seek target; each completed seek still
   * publishes so keypoints do not lag on an old frame.
   */
  private seekToFrame(frame: number) {
    this.pendingFrame = frame;
    this.videoPlayers.forEach((videoPlayer) => {
      videoPlayer.videoElement?.nativeElement.pause();
    });
    this.isPlaying.next(false);
    const el = this.primaryVideo();
    if (!el) {
      this.commitDisplayedFrame(frame);
      return;
    }
    if (this.seeking) return;
    this.beginSeek(el, frame);
  }

  private beginSeek(el: HTMLVideoElement, frame: number) {
    this.clearSeekWait();
    this.seeking = true;
    const time = frame / this.fps();

    const finish = () => {
      this.clearSeekWait();
      const pending = this.pendingFrame;
      this.commitDisplayedFrame(frame);
      if (pending != null && pending !== frame) {
        this.pendingFrame = pending;
        this.beginSeek(el, pending);
      }
    };

    if (Math.abs(el.currentTime - time) < 1e-4) {
      finish();
      return;
    }

    this.seekedListener = finish;
    el.addEventListener('seeked', finish);
    this.seekTimeout = setTimeout(finish, 500);
    this.videoPlayers.forEach((videoPlayer) => {
      const video = videoPlayer.videoElement?.nativeElement as
        | HTMLVideoElement
        | undefined;
      if (video) video.currentTime = time;
    });
  }

  private commitDisplayedFrame(frame: number) {
    this.pendingFrame = null;
    const duration = this.duration();
    const fps = this.fps();
    const time = fps > 0 ? frame / fps : 0;
    this.currentTime.next(Math.min(Math.max(time, 0), duration));
  }

  private clearSeekWait() {
    const el = this.primaryVideo();
    if (el && this.seekedListener) {
      el.removeEventListener('seeked', this.seekedListener);
    }
    if (this.seekTimeout != null) {
      clearTimeout(this.seekTimeout);
      this.seekTimeout = null;
    }
    this.seekedListener = null;
    this.seeking = false;
  }

  private applyPlaybackRateToPlayers(rate: PlaybackRate) {
    this.videoPlayers.forEach((videoPlayer) => {
      const el = videoPlayer.videoElement?.nativeElement as
        | HTMLVideoElement
        | undefined;
      if (el) {
        el.playbackRate = rate;
      }
    });
  }

  private onPlay() {
    // Sync the start timestamp for all video players before playing
    this.videoPlayers.forEach((videoPlayer) => {
      const el = videoPlayer.videoElement?.nativeElement;
      if (el) {
        el.currentTime = this.currentTime.value;
        el.playbackRate = this.playbackRate();
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
    // A frame-step may already be seeking to a new time; don't yank
    // the videos back to the last displayed timestamp.
    if (this.pendingFrame != null) return;
    this.videoPlayers.forEach((videoPlayer) => {
      const el = videoPlayer.videoElement?.nativeElement;
      if (el) {
        el.currentTime = this.currentTime.value;
      }
    });
  }

  private onSeek() {
    // only called while players are paused.
    if (this.seeking || this.pendingFrame != null) return;

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

function isPlaybackRate(rate: number): rate is PlaybackRate {
  return (PLAYBACK_RATES as readonly number[]).includes(rate);
}
