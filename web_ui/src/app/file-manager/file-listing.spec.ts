import { applyCachedChecks, keepCurrentPathOrder } from './file-listing';

describe('keepCurrentPathOrder', () => {
  it('keeps the on-screen order when validation returns a different order', () => {
    const current = [
      'calibration.toml',
      'calibrations/b.toml',
      'calibrations/a.toml',
    ];
    const items = [
      { path: 'calibrations/a.toml', issues: ['a'] },
      { path: 'calibration.toml', issues: [] },
      { path: 'calibrations/b.toml', issues: ['b'] },
      { path: 'calibrations/c.toml', issues: [] },
    ];
    expect(keepCurrentPathOrder(current, items).map((item) => item.path)).toEqual([
      'calibration.toml',
      'calibrations/b.toml',
      'calibrations/a.toml',
      'calibrations/c.toml',
    ]);
  });
});

describe('applyCachedChecks', () => {
  it('checks only the paths the cache still accepts', () => {
    const rows = [
      { path: 'a.csv', detail: null, issues: [] as string[], warnings: [] as string[], checked: false },
      { path: 'b.csv', detail: null, issues: ['old'], warnings: [] as string[], checked: true },
    ];
    const next = applyCachedChecks(rows, [
      { path: 'a.csv', issues: [], warnings: ['extra bodypart'] },
    ]);
    expect(next[0]).toEqual({
      path: 'a.csv',
      detail: null,
      issues: [],
      warnings: ['extra bodypart'],
      checked: true,
    });
    expect(next[1].checked).toBe(false);
    expect(next[1].issues).toEqual([]);
  });
});
