import { keepCurrentPathOrder } from './file-listing';

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
