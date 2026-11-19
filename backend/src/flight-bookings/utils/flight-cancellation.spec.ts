import { hasDeparted, wholeDaysUntil } from './flight-cancellation';

const now = new Date('2026-12-01T10:00:00Z');

describe('hasDeparted', () => {
  it('is false before departure', () => {
    expect(hasDeparted(new Date('2026-12-01T10:00:01Z'), now)).toBe(false);
  });
  it('is true at and after departure', () => {
    expect(hasDeparted(new Date('2026-12-01T10:00:00Z'), now)).toBe(true);
    expect(hasDeparted(new Date('2026-11-30T10:00:00Z'), now)).toBe(true);
  });
});

describe('wholeDaysUntil', () => {
  it('counts whole days only', () => {
    expect(wholeDaysUntil(new Date('2026-12-04T09:59:59Z'), now)).toBe(2);
    expect(wholeDaysUntil(new Date('2026-12-04T10:00:00Z'), now)).toBe(3);
  });
  it('is 0 on the day of departure and never negative', () => {
    expect(wholeDaysUntil(new Date('2026-12-01T20:00:00Z'), now)).toBe(0);
    expect(wholeDaysUntil(new Date('2026-11-01T00:00:00Z'), now)).toBe(0);
  });
});
