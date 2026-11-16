import { isCalendarDate, parseCalendarDate } from './calendar-date';

describe('calendar-date', () => {
  it('accepts real YYYY-MM-DD dates', () => {
    expect(parseCalendarDate('2027-02-28')?.toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
    expect(isCalendarDate('2028-02-29')).toBe(true); // leap year
  });

  it('rejects impossible dates', () => {
    expect(isCalendarDate('2027-02-30')).toBe(false);
    expect(isCalendarDate('2027-02-29')).toBe(false); // not a leap year
    expect(isCalendarDate('2027-04-31')).toBe(false);
    expect(isCalendarDate('2027-13-01')).toBe(false);
    expect(isCalendarDate('2027-00-10')).toBe(false);
    expect(isCalendarDate('2027-01-00')).toBe(false);
  });

  it('rejects timestamps and time zones', () => {
    expect(isCalendarDate('2027-02-10T00:00:00Z')).toBe(false);
    expect(isCalendarDate('2027-02-10T10:00:00+02:00')).toBe(false);
    expect(isCalendarDate('2027-02-10T00:00:00.000Z')).toBe(false);
    expect(isCalendarDate('2027-02-10 10:00')).toBe(false);
  });

  it('rejects other formats and non-strings', () => {
    expect(isCalendarDate('10/02/2027')).toBe(false);
    expect(isCalendarDate('2027-2-1')).toBe(false);
    expect(isCalendarDate(' 2027-02-10')).toBe(false);
    expect(isCalendarDate('')).toBe(false);
    expect(isCalendarDate(undefined)).toBe(false);
    expect(isCalendarDate(20270210)).toBe(false);
  });
});
