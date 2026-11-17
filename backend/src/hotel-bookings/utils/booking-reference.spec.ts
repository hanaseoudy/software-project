import {
  generateBookingReference,
  HOTEL_REFERENCE_PATTERN,
} from './booking-reference';

describe('generateBookingReference', () => {
  it('matches the HTL-XXXXXXXX format', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateBookingReference()).toMatch(HOTEL_REFERENCE_PATTERN);
    }
  });

  it('never uses ambiguous characters (0, O, 1, I)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateBookingReference().slice(4)).not.toMatch(/[01OI]/);
    }
  });

  it('produces different references', () => {
    const refs = new Set(
      Array.from({ length: 500 }, () => generateBookingReference()),
    );
    expect(refs.size).toBe(500);
  });
});
