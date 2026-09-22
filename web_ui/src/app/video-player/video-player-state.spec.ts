import { TestBed } from '@angular/core/testing';
import { VideoPlayerState } from './video-player-state';

describe('VideoPlayerState', () => {
  let state: VideoPlayerState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VideoPlayerState],
    });
    state = TestBed.inject(VideoPlayerState);
    state.duration.set(10);
    state.fps.set(30);
  });

  function loadClip(duration = 10, fps = 30) {
    state.duration.set(duration);
    state.fps.set(fps);
  }

  it('steps forward and back by one frame', () => {
    state.stepFrame(1);
    expect(state.currentFrameSignal()).toBe(1);
    expect(state.currentTime.value).toBeCloseTo(1 / 30, 6);

    state.stepFrame(-1);
    expect(state.currentFrameSignal()).toBe(0);
    expect(state.currentTime.value).toBe(0);
  });

  it('clamps single-frame steps at 0 and last frame', () => {
    state.stepFrame(-1);
    expect(state.currentFrameSignal()).toBe(0);

    state.seekToEnd();
    expect(state.currentFrameSignal()).toBe(299);
    state.stepFrame(1);
    expect(state.currentFrameSignal()).toBe(299);
  });

  it('steps 10 frames and clamps at the ends', () => {
    state.stepFrame(10);
    expect(state.currentFrameSignal()).toBe(10);

    state.stepFrame(-10);
    expect(state.currentFrameSignal()).toBe(0);

    state.stepFrame(-10);
    expect(state.currentFrameSignal()).toBe(0);

    state.currentTime.next(295 / 30);
    state.stepFrame(10);
    expect(state.currentFrameSignal()).toBe(299);
  });

  it('seeks to start and end', () => {
    state.stepFrame(10);
    state.seekToStart();
    expect(state.currentTime.value).toBe(0);
    expect(state.isPlaying.value).toBeFalse();

    state.seekToEnd();
    expect(state.currentFrameSignal()).toBe(299);
    expect(state.currentTime.value).toBeCloseTo(299 / 30, 6);
    expect(state.isPlaying.value).toBeFalse();
  });

  it('seekToFrame clamps below 0 and above the last frame', () => {
    state.seekToFrame(10000);
    expect(state.currentFrameSignal()).toBe(299);
    state.seekToFrame(-3);
    expect(state.currentFrameSignal()).toBe(0);
  });

  it('pauses when stepping while playing', () => {
    state.isPlaying.next(true);
    state.stepFrame(1);
    expect(state.isPlaying.value).toBeFalse();
    expect(state.currentFrameSignal()).toBe(1);
  });

  it('nudges playback rate and clamps at 1/16 and 1', () => {
    expect(state.playbackRate()).toBe(1);
    state.nudgePlaybackRate(1);
    expect(state.playbackRate()).toBe(1);

    state.nudgePlaybackRate(-1);
    expect(state.playbackRate()).toBe(0.5);
    state.nudgePlaybackRate(-1);
    expect(state.playbackRate()).toBe(0.25);
    state.nudgePlaybackRate(-1);
    expect(state.playbackRate()).toBe(0.125);
    state.nudgePlaybackRate(-1);
    expect(state.playbackRate()).toBe(0.0625);
    state.nudgePlaybackRate(-1);
    expect(state.playbackRate()).toBe(0.0625);

    state.nudgePlaybackRate(1);
    expect(state.playbackRate()).toBe(0.125);
    state.nudgePlaybackRate(1);
    expect(state.playbackRate()).toBe(0.25);
  });

  it('ignores unknown playback rates', () => {
    state.setPlaybackRate(2);
    expect(state.playbackRate()).toBe(1);
    state.setPlaybackRate(0.5);
    expect(state.playbackRate()).toBe(0.5);
  });

  it('reset restores time, duration, pause, and 1x rate', () => {
    state.stepFrame(10);
    state.setPlaybackRate(0.25);
    state.isPlaying.next(true);
    state.reset();

    expect(state.currentTime.value).toBe(0);
    expect(state.duration()).toBe(0);
    expect(state.isPlaying.value).toBeFalse();
    expect(state.playbackRate()).toBe(1);
  });

  it('does not seek or play without a loaded video', () => {
    state.reset();
    state.stepFrame(1);
    state.seekToEnd();
    state.toggleIsPlaying();
    expect(state.currentTime.value).toBe(0);
    expect(state.isPlaying.value).toBeFalse();
  });

  it('toggleIsPlaying flips play state when a video is loaded', () => {
    loadClip();
    state.toggleIsPlaying();
    expect(state.isPlaying.value).toBeTrue();
    state.toggleIsPlaying();
    expect(state.isPlaying.value).toBeFalse();
  });

  it('does not update displayed frame until the primary video seeked', () => {
    const { el, player } = mockVideoPlayer();
    state.registerVideoPlayer(player);

    state.stepFrame(1);
    expect(state.currentFrameSignal()).toBe(0);
    expect(el.currentTime).toBeCloseTo(1 / 30, 6);

    el.fireSeeked();
    expect(state.currentFrameSignal()).toBe(1);
  });

  it('coalesces rapid steps but still publishes each completed seek', () => {
    const { el, player } = mockVideoPlayer();
    state.registerVideoPlayer(player);

    state.stepFrame(1);
    state.stepFrame(1);
    state.stepFrame(1);
    expect(state.currentFrameSignal()).toBe(0);

    el.fireSeeked();
    expect(state.currentFrameSignal()).toBe(1);
    expect(el.currentTime).toBeCloseTo(3 / 30, 6);

    el.fireSeeked();
    expect(state.currentFrameSignal()).toBe(3);
  });
});

function mockVideoPlayer() {
  const listeners = new Map<string, Set<() => void>>();
  const el = {
    currentTime: 0,
    playbackRate: 1,
    pause() {},
    play: () => Promise.resolve(),
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
    fireSeeked() {
      [...(listeners.get('seeked') ?? [])].forEach((fn) => fn());
    },
  };
  return {
    el,
    player: { videoElement: { nativeElement: el } } as any,
  };
}
