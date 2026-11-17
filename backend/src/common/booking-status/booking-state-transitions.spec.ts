import {
  ALLOWED_BOOKING_TRANSITIONS,
  assertBookingTransition,
  BookingStatus,
  canTransitionBooking,
  InvalidBookingTransitionError,
  isTerminalBookingStatus,
} from './booking-state-transitions';

describe('booking state transitions (GEN-11)', () => {
  const allowed: Array<[BookingStatus, BookingStatus]> = [
    [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED],
    [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
    [BookingStatus.PENDING_PAYMENT, BookingStatus.EXPIRED],
    [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransitionBooking(from, to)).toBe(true);
    expect(() => assertBookingTransition(from, to)).not.toThrow();
  });

  it('rejects every other transition between the five statuses', () => {
    const all = Object.values(BookingStatus);
    const isAllowed = (from: BookingStatus, to: BookingStatus) =>
      allowed.some(([f, t]) => f === from && t === to);

    for (const from of all) {
      for (const to of all) {
        if (isAllowed(from, to)) continue;
        expect(canTransitionBooking(from, to)).toBe(false);
        expect(() => assertBookingTransition(from, to)).toThrow(
          InvalidBookingTransitionError,
        );
      }
    }
  });

  it('does not allow skipping Confirmed or reviving ended bookings', () => {
    expect(
      canTransitionBooking(
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.COMPLETED,
      ),
    ).toBe(false);
    expect(
      canTransitionBooking(
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.CANCELLED,
      ),
    ).toBe(false);
    expect(
      canTransitionBooking(BookingStatus.EXPIRED, BookingStatus.CONFIRMED),
    ).toBe(false);
    expect(
      canTransitionBooking(BookingStatus.CANCELLED, BookingStatus.CONFIRMED),
    ).toBe(false);
  });

  it('rejects unknown statuses such as HELD', () => {
    expect(canTransitionBooking('HELD', BookingStatus.CONFIRMED)).toBe(false);
    expect(canTransitionBooking(BookingStatus.PENDING_PAYMENT, 'HELD')).toBe(
      false,
    );
    expect(canTransitionBooking('constructor', 'toString')).toBe(false);
  });

  it('reports COMPLETED, EXPIRED and CANCELLED as terminal', () => {
    expect(isTerminalBookingStatus(BookingStatus.COMPLETED)).toBe(true);
    expect(isTerminalBookingStatus(BookingStatus.EXPIRED)).toBe(true);
    expect(isTerminalBookingStatus(BookingStatus.CANCELLED)).toBe(true);
    expect(isTerminalBookingStatus(BookingStatus.PENDING_PAYMENT)).toBe(false);
    expect(isTerminalBookingStatus(BookingStatus.CONFIRMED)).toBe(false);
  });

  it('defines a rule for every status', () => {
    expect(Object.keys(ALLOWED_BOOKING_TRANSITIONS).sort()).toEqual(
      Object.values(BookingStatus).sort(),
    );
  });
});
