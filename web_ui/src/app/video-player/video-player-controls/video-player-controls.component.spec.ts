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
    expect(frameInput().value).toBe('0');
    expect(timeInput().value).toBe('0.00');
    expect(fixture.nativeElement.textContent).toContain('/ 10.00 s');
    const help = fixture.nativeElement.querySelector(
      '[aria-label="Playback help"]',
    ) as HTMLElement;
    expect(help).toBeTruthy();
    const helpText = (
      fixture.nativeElement.querySelector('.shortcut-help') as HTMLElement
    ).textContent;
    expect(helpText).toContain('Click');
    expect(helpText).toContain('Keyboard controls:');
    expect(helpText).not.toContain('Shift+click');

    expect(frameInput().closest('[data-tip]')?.getAttribute('data-tip')).toBe(
      'Click to enter frame',
    );
    expect(timeInput().closest('[data-tip]')?.getAttribute('data-tip')).toBe(
      'Click to enter time',
    );
    expect(stepTip('Next frame')).toBe(
      'Next frame\n(Shift+click = 10 frames)',
    );
    expect(stepTip('Previous frame')).toBe(
      'Previous frame\n(Shift+click = 10 frames)',
    );
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

  it('toggles play with Space even when a button is focused', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(state.isPlaying.value).toBeTrue();
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

  function stepTip(label: string): string | null {
    return fixture.nativeElement
      .querySelector(`[aria-label="${label}"]`)
      ?.getAttribute('data-tip');
  }

  function seekSlider(): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      '[aria-label="Seek"]',
    ) as HTMLInputElement;
  }

  function frameInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      '[aria-label="Frame"]',
    ) as HTMLInputElement;
  }

  function timeInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      '[aria-label="Time"]',
    ) as HTMLInputElement;
  }

  function commitField(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
  }

  it('sets slider max to last-frame time, not duration', () => {
    const max = Number(seekSlider().max);
    expect(max).toBeCloseTo(299 / 30, 6);
    expect(max).toBeLessThan(state.duration());
  });

  it('commits the native max on change even if currentTime lagged', () => {
    state.currentTime.next(5);
    fixture.detectChanges();
    const slider = seekSlider();
    slider.value = slider.max;
    slider.dispatchEvent(new Event('change'));
    expect(state.currentFrameSignal()).toBe(299);
    expect(state.isPlaying.value).toBeFalse();
  });

  it('commits the native min on change', () => {
    state.currentTime.next(5);
    const slider = seekSlider();
    slider.value = '0';
    slider.dispatchEvent(new Event('change'));
    expect(state.currentFrameSignal()).toBe(0);
  });

  it('a burst of input then change at max lands on the last frame', () => {
    const controls = fixture.componentInstance;
    controls.onSliderInput('1');
    controls.onSliderInput('5');
    controls.onSliderInput('8');
    controls.onSliderChange(String(299 / 30));
    expect(state.currentFrameSignal()).toBe(299);
  });

  it('blurs the seek slider on change so arrows are not captured', () => {
    const slider = seekSlider();
    slider.focus();
    expect(document.activeElement).toBe(slider);
    slider.value = slider.max;
    slider.dispatchEvent(new Event('change'));
    expect(document.activeElement).not.toBe(slider);
  });

  it('emits extractFrame on a', () => {
    let emitted = 0;
    fixture.componentInstance.extractFrame.subscribe(() => {
      emitted += 1;
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }),
    );
    expect(emitted).toBe(1);
  });

  it('floors a typed frame and clamps to the last frame', () => {
    commitField(frameInput(), '128.9');
    expect(state.currentFrameSignal()).toBe(128);

    commitField(frameInput(), '10000');
    expect(state.currentFrameSignal()).toBe(299);
  });

  it('leaves the frame unchanged when the entry is empty', () => {
    state.currentTime.next(5);
    fixture.detectChanges();
    const before = state.currentFrameSignal();
    commitField(frameInput(), '  ');
    expect(state.currentFrameSignal()).toBe(before);
  });

  it('rounds a typed time to 0.01 s and clamps', () => {
    commitField(timeInput(), '1.234');
    expect(state.currentFrameSignal()).toBe(37);
    expect(timeInput().value).toBe('1.23');

    commitField(timeInput(), '-1');
    expect(state.currentFrameSignal()).toBe(0);

    commitField(timeInput(), '99');
    expect(state.currentFrameSignal()).toBe(299);
  });

  it('Escape restores the previous frame readout', () => {
    state.seekToFrame(10);
    fixture.detectChanges();
    const input = frameInput();
    input.focus();
    input.value = '50';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(state.currentFrameSignal()).toBe(10);
    expect(input.value).toBe('10');
  });
});
