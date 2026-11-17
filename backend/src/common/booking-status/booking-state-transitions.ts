/**
 * GEN-11: lifecycle shared by flight bookings and hotel reservations.
 *
 * Allowed transitions (and only these):
 *   PENDING_PAYMENT -> CONFIRMED  -> COMPLETED
 *   PENDING_PAYMENT -> EXPIRED    (hold timeout)
 *   CONFIRMED       -> CANCELLED  (user or provider cancellation)
 *
 * The values match the strings already stored by HotelBookingStatus and
 * FlightBookingStatus, so those enum values can be passed in directly.
 */
export enum BookingStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export const ALLOWED_BOOKING_TRANSITIONS: Readonly<
  Record<BookingStatus, readonly BookingStatus[]>
> = {
  [BookingStatus.PENDING_PAYMENT]: [
    BookingStatus.CONFIRMED,
    BookingStatus.EXPIRED,
  ],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.CANCELLED]: [],
};

function isBookingStatus(value: string): value is BookingStatus {
  return Object.prototype.hasOwnProperty.call(
    ALLOWED_BOOKING_TRANSITIONS,
    value,
  );
}

/** Returns true only for a transition listed in GEN-11. Unknown statuses are never allowed. */
export function canTransitionBooking(from: string, to: string): boolean {
  if (!isBookingStatus(from) || !isBookingStatus(to)) {
    return false;
  }
  return ALLOWED_BOOKING_TRANSITIONS[from].includes(to);
}

/**
 * Thrown when a status change is not allowed by GEN-11. It is a plain Error so
 * this file has no framework dependency; the caller (service/controller) should
 * map it to an HTTP 409 Conflict.
 */
export class InvalidBookingTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid booking status transition: ${from} -> ${to}`);
    this.name = 'InvalidBookingTransitionError';
  }
}

/** Throws InvalidBookingTransitionError when the transition is not allowed by GEN-11. */
export function assertBookingTransition(from: string, to: string): void {
  if (!canTransitionBooking(from, to)) {
    throw new InvalidBookingTransitionError(from, to);
  }
}

/** True when no further transition is possible (COMPLETED, EXPIRED, CANCELLED). */
export function isTerminalBookingStatus(status: string): boolean {
  return (
    isBookingStatus(status) && ALLOWED_BOOKING_TRANSITIONS[status].length === 0
  );
}
