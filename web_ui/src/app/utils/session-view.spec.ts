import {
  framePathKey,
  rsplitSessionView,
  sessionViewKey,
  splitSessionView,
  viewsWithUnderscore,
  viewUnderscoreMessage,
} from './session-view';

describe('session-view', () => {
  it('splits at the last underscore', () => {
    expect(rsplitSessionView('mouse1_day2_top')).toEqual({
      session: 'mouse1_day2',
      view: 'top',
    });
    expect(rsplitSessionView('top')).toBeNull();
    expect(rsplitSessionView('_top')).toBeNull();
    expect(rsplitSessionView('mouse1_')).toBeNull();
  });

  it('keeps cam1 and cam10 apart', () => {
    const views = ['cam1', 'cam10'];
    expect(sessionViewKey('trial_cam10.mp4', views)).toEqual({
      key: 'trial_*.mp4',
      view: 'cam10',
    });
    expect(sessionViewKey('trial_cam1.mp4', views)).toEqual({
      key: 'trial_*.mp4',
      view: 'cam1',
    });
  });

  it('leaves a view name inside the session name alone', () => {
    const views = ['top', 'side'];
    expect(sessionViewKey('stop_top.mp4', views)?.key).toBe('stop_*.mp4');
    expect(sessionViewKey('stop_side.mp4', views)?.key).toBe('stop_*.mp4');
  });

  it('has no key for an unknown view, a single-view project, or a view with _', () => {
    expect(sessionViewKey('mouse1_back.mp4', ['top', 'side'])).toBeNull();
    expect(splitSessionView('mouse1_top', [])).toBeNull();
    expect(sessionViewKey('mouse1_cam_top.mp4', ['cam_top'])).toBeNull();
  });

  it('pairs labeled frames by their <session>_<view> folder', () => {
    expect(framePathKey('labeled-data/stop_top/img00000001.png', 'top')).toBe(
      'labeled-data/stop_*/img00000001.png',
    );
    expect(framePathKey('labeled-data/stop_side/img00000001.png', 'side')).toBe(
      'labeled-data/stop_*/img00000001.png',
    );
    expect(framePathKey('labeled-data/sess/img00000001.png', 'unknown')).toBe(
      'labeled-data/sess/img00000001.png',
    );
  });

  it('names view names that contain _', () => {
    expect(viewsWithUnderscore(['cam_top', 'side'])).toEqual(['cam_top']);
    expect(viewUnderscoreMessage(['cam_top'])).toBe(
      "View names can't contain _ (cam_top), because video and folder names " +
        'are split at the last _. Use - instead (for example cam-top).',
    );
  });
});
