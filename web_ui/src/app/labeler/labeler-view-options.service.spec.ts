import { TestBed } from '@angular/core/testing';

import { LabelerViewOptionsService } from './labeler-view-options.service';

describe('LabelerViewOptionsService keypoint opacity', () => {
  const KEY = 'labeler-view-options.opacity';
  let saved: string | null;

  beforeEach(() => {
    saved = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    TestBed.configureTestingModule({
      providers: [LabelerViewOptionsService],
    });
  });

  afterEach(() => {
    if (saved === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, saved);
  });

  it('starts at 0.5 when nothing is saved, and Reset goes back to 0.5', () => {
    const options = TestBed.inject(LabelerViewOptionsService);
    expect(options.keypointOpacity()).toBe(0.5);
    expect(options.isOpacityDefault()).toBeTrue();

    options.keypointOpacity.set(0.8);
    expect(options.isOpacityDefault()).toBeFalse();
    options.resetOpacity();
    expect(options.keypointOpacity()).toBe(0.5);
  });

  it('keeps a saved opacity', () => {
    localStorage.setItem(KEY, '0.2');
    const options = TestBed.inject(LabelerViewOptionsService);
    expect(options.keypointOpacity()).toBe(0.2);
  });
});

describe('LabelerViewOptionsService keep selected keypoint', () => {
  const KEY = 'labeler-view-options.keepSelectedKeypoint';
  let saved: string | null;

  beforeEach(() => {
    saved = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    TestBed.configureTestingModule({
      providers: [LabelerViewOptionsService],
    });
  });

  afterEach(() => {
    if (saved === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, saved);
  });

  it('is off by default and comes back on after a reload once turned on', () => {
    const options = TestBed.inject(LabelerViewOptionsService);
    expect(options.keepSelectedKeypoint()).toBeFalse();

    options.keepSelectedKeypoint.set(true);
    TestBed.tick();
    expect(localStorage.getItem(KEY)).toBe('true');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [LabelerViewOptionsService] });
    expect(TestBed.inject(LabelerViewOptionsService).keepSelectedKeypoint()).toBeTrue();
  });
});

describe('LabelerViewOptionsService show slider numbers', () => {
  const KEY = 'labeler-view-options.showSliderNumbers';
  let saved: string | null;

  beforeEach(() => {
    saved = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    TestBed.configureTestingModule({
      providers: [LabelerViewOptionsService],
    });
  });

  afterEach(() => {
    if (saved === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, saved);
  });

  it('is off by default and comes back on after a reload once turned on', () => {
    const options = TestBed.inject(LabelerViewOptionsService);
    expect(options.showSliderNumbers()).toBeFalse();

    options.showSliderNumbers.set(true);
    TestBed.tick();
    expect(localStorage.getItem(KEY)).toBe('true');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [LabelerViewOptionsService] });
    expect(TestBed.inject(LabelerViewOptionsService).showSliderNumbers()).toBeTrue();
  });
});
