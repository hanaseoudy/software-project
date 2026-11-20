import {
  FLIGHT_REFERENCE_PATTERN,
  generateFlightReference,
} from './flight-reference';

describe('generateFlightReference', () => {
  it('looks like FLT- followed by 8 unambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateFlightReference()).toMatch(FLIGHT_REFERENCE_PATTERN);
    }
  });

  it('does not repeat in a normal run', () => {
    const refs = new Set(Array.from({ length: 500 }, generateFlightReference));
    expect(refs.size).toBe(500);
  });
});
