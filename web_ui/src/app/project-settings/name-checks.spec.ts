import { caseOnlyDuplicates, describeCaseDuplicates } from './name-checks';

describe('caseOnlyDuplicates', () => {
  it('groups names that differ only in letter case', () => {
    expect(caseOnlyDuplicates(['Top', 'side', 'top', 'TOP'])).toEqual([
      ['Top', 'top', 'TOP'],
    ]);
    expect(caseOnlyDuplicates(['top', 'side'])).toEqual([]);
    expect(describeCaseDuplicates([['Top', 'top', 'TOP']])).toBe(
      'Top, top and TOP',
    );
  });
});
