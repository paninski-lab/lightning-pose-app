import { listedViews } from './listed-views';

describe('listedViews', () => {
  it('lists the project views without the "unknown" placeholder, in order', () => {
    expect(listedViews(['top', 'bot', 'unknown'])).toEqual(['top', 'bot']);
  });
});
