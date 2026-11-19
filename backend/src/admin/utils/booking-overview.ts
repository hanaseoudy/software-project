/**
 * ACC-17: pure helpers for the admin booking overview (no framework code, so
 * they can be unit tested on their own).
 */

export interface OverviewUser {
  _id: unknown;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface OverviewRow {
  type: 'flight' | 'hotel';
  id: string;
  reference: string | null;
  user: { id: string; name: string; email: string } | null;
  provider: string | null;
  startDate: Date | null;
  endDate: Date | null;
  amount: number;
  currency: string;
  status: string;
  createdAt: Date | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/** From/to are calendar days (UTC); the whole "to" day is included. */
export function createdAtRange(
  from?: string,
  to?: string,
): { $gte?: Date; $lt?: Date } | undefined {
  const range: { $gte?: Date; $lt?: Date } = {};
  if (from) range.$gte = startOfDay(from);
  if (to) range.$lt = new Date(startOfDay(to).getTime() + DAY_MS);
  if (range.$gte && range.$lt && range.$gte >= range.$lt) {
    throw new RangeError('From must not be after to');
  }
  return range.$gte || range.$lt ? range : undefined;
}

function startOfDay(value: string): Date {
  const d = new Date(value);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function toUser(user: OverviewUser | null | undefined): OverviewRow['user'] {
  if (!user || typeof user !== 'object' || !('email' in user)) return null;
  return {
    id: String(user._id),
    name: [user.firstName, user.lastName].filter(Boolean).join(' '),
    email: user.email ?? '',
  };
}

export interface HotelBookingLean {
  _id: unknown;
  bookingReference?: string;
  user?: OverviewUser | null;
  hotel?: { name?: string } | null;
  checkIn: Date;
  checkOut: Date;
  totalPrice: number;
  currency: string;
  status: string;
  createdAt?: Date;
}

export function toHotelRow(b: HotelBookingLean): OverviewRow {
  return {
    type: 'hotel',
    id: String(b._id),
    reference: b.bookingReference ?? null,
    user: toUser(b.user),
    provider: b.hotel?.name ?? null,
    startDate: b.checkIn,
    endDate: b.checkOut,
    amount: round2(b.totalPrice),
    currency: b.currency,
    status: b.status,
    createdAt: b.createdAt ?? null,
  };
}

export interface FlightBookingLean {
  _id: unknown;
  bookingReference?: string;
  user?: OverviewUser | null;
  outboundFlight?: {
    departureTime?: Date;
    arrivalTime?: Date;
    airline?: { name?: string } | null;
  } | null;
  returnFlight?: {
    arrivalTime?: Date;
    airline?: { name?: string } | null;
  } | null;
  totalPrice: number;
  baggageFees?: number;
  currency: string;
  status: string;
  createdAt?: Date;
}

export function toFlightRow(b: FlightBookingLean): OverviewRow {
  const airlines = [
    b.outboundFlight?.airline?.name,
    b.returnFlight?.airline?.name,
  ].filter((name): name is string => !!name);
  return {
    type: 'flight',
    id: String(b._id),
    reference: b.bookingReference ?? null,
    user: toUser(b.user),
    provider: airlines.length ? [...new Set(airlines)].join(' / ') : null,
    startDate: b.outboundFlight?.departureTime ?? null,
    endDate:
      b.returnFlight?.arrivalTime ?? b.outboundFlight?.arrivalTime ?? null,
    // Same amount PAY-01 charges: seat fares + baggage fees.
    amount: round2(round2(b.totalPrice) + round2(b.baggageFees ?? 0)),
    currency: b.currency,
    status: b.status,
    createdAt: b.createdAt ?? null,
  };
}

/** Newest first; the id breaks ties so the order is stable between pages. */
export function newestFirst(a: OverviewRow, b: OverviewRow): number {
  // Old rows written without timestamps have no createdAt: they count as oldest.
  const diff = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  return diff !== 0 ? diff : b.id.localeCompare(a.id);
}
