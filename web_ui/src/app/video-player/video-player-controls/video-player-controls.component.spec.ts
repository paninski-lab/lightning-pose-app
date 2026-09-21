import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VideoPlayerControlsComponent } from './video-player-controls.component';
import { VideoPlayerState } from '../video-player-state';

describe('VideoPlayerControlsComponent', () => {
  let fixture: ComponentFixture<VideoPlayerControlsComponent>;
  let state: VideoPlayerState;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoPlayerControlsComponent],
      providers: [VideoPlayerState],
    }).compileComponents();

    state = TestBed.inject(VideoPlayerState);
    state.duration.set(10);
    state.fps.set(30);
    fixture = TestBed.createComponent(VideoPlayerControlsComponent);
    fixture.detectChanges();
  });

  it('creates the transport bar', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    expect(fixture.nativeElement.textContent).toContain('f 0');
    expect(fixture.nativeElement.textContent).toContain('0.00 / 10.00 s');
    expect(
      fixture.nativeElement.querySelector('[aria-label="Keyboard shortcuts"]'),
    ).toBeTruthy();
  });

  it('handles Space, arrows, and Shift+arrows from the document', () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(state.isPlaying.value).toBeTrue();

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(state.isPlaying.value).toBeFalse();
    expect(state.currentFrameSignal()).toBe(1);

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(state.currentFrameSignal()).toBe(11);
  });

  it('ignores Space on a focused button', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(state.isPlaying.value).toBeFalse();
    button.remove();
  });

  it('Shift+clicks the frame buttons in steps of 10', () => {
    const next = fixture.nativeElement.querySelector(
      '[aria-label="Next frame"]',
    ) as HTMLButtonElement;
    next.dispatchEvent(
      new MouseEvent('click', { bubbles: true, shiftKey: true, cancelable: true }),
    );
    expect(state.currentFrameSignal()).toBe(10);

    const prev = fixture.nativeElement.querySelector(
      '[aria-label="Previous frame"]',
    ) as HTMLButtonElement;
    prev.dispatchEvent(
      new MouseEvent('click', { bubbles: true, shiftKey: true, cancelable: true }),
    );
    expect(state.currentFrameSignal()).toBe(0);
  });
});
