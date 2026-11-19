import type { Types } from 'mongoose';

/** Infants pay 10% of the adult/child fare (see Cabin.price). */
export const INFANT_FARE_RATIO = 0.1;

/** FLT-27: a fare difference to pay must be paid within 10 minutes, like a booking hold. */
export const CHANGE_HOLD_MS = 10 * 60 * 1000;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Seat fares of one leg: adults and children pay the fare, infants 10% of it. */
export function legFare(price: number, seats: number, infants: number): number {
  return price * seats + price * INFANT_FARE_RATIO * infants;
}

/** What the booking costs in total: seat fares + baggage fees (the amount PAY-01 charges). */
export function chargeTotal(totalPrice: number, baggageFees = 0): number {
  return round2(round2(totalPrice) + round2(baggageFees));
}

/** Positive: the user pays more. Negative: the user gets money back. */
export function fareDifference(
  currentAmount: number,
  newAmount: number,
): number {
  return round2(newAmount - currentAmount);
}

export type FareOutcome = 'NO_PAYMENT' | 'PAY_DIFFERENCE' | 'REFUND_DIFFERENCE';

export function fareOutcome(difference: number): FareOutcome {
  if (difference > 0) return 'PAY_DIFFERENCE';
  if (difference < 0) return 'REFUND_DIFFERENCE';
  return 'NO_PAYMENT';
}

interface Route {
  departureAirport: Types.ObjectId;
  arrivalAirport: Types.ObjectId;
}

/** A replacement flight must fly exactly the same route as the one it replaces. */
export function isSameRoute(a: Route, b: Route): boolean {
  return (
    a.departureAirport.equals(b.departureAirport) &&
    a.arrivalAirport.equals(b.arrivalAirport)
  );
}
