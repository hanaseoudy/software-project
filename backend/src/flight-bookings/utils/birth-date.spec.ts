import { isPastCalendarDate } from './birth-date';

describe('isPastCalendarDate', () => {
  it('accepts a real past date', () =>
    expect(isPastCalendarDate('1999-05-20')).toBe(true));
  it('rejects a future date', () =>
    expect(isPastCalendarDate('2999-01-01')).toBe(false));
  it('rejects a day that does not exist', () =>
    expect(isPastCalendarDate('2001-02-30')).toBe(false));
  it('rejects a wrong format', () => {
    expect(isPastCalendarDate('20/05/1999')).toBe(false);
    expect(isPastCalendarDate('1999-05-20T10:00:00Z')).toBe(false);
    expect(isPastCalendarDate(19990520)).toBe(false);
  });
});
