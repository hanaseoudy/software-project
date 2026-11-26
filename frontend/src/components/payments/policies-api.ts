// PAY-02 endpoints used by <PolicyAcceptance /> (PAYC-3). Shapes follow the backend's
// PoliciesService responses (see Swagger, "Payments & Policies").
import { apiFetch } from "@/lib/api";

export type PolicyBookingType = "flight" | "hotel";

/** FLT-09: refund % for a cancellation at least `daysBeforeDeparture` days before departure. */
export interface FlightCancellationRule {
  daysBeforeDeparture: number;
  refundPercent: number;
}

/** HTL-10: refund % for a cancellation at least `daysBeforeCheckIn` days before check-in. */
export interface HotelCancellationTier {
  daysBeforeCheckIn: number;
  refundPercentage: number;
}

export interface FlightLegPolicies {
  direction: "outbound" | "return";
  flightNumber: string;
  airline: { id: string; name: string; code?: string };
  cancellationPolicy?: { rules?: FlightCancellationRule[] } | null;
  /** FLT-04 free allowance of the booked cabin + FLT-08 extra bags. */
  baggagePolicy: {
    freeBags: number;
    maxBagWeightKg: number | null;
    extraBagPrice: number;
    maxExtraBagsPerPassenger: number;
  };
}

export interface FlightPolicies {
  bookingType: "flight";
  cabinClass?: string;
  flights: FlightLegPolicies[];
}

export interface HotelPolicies {
  bookingType: "hotel";
  hotel: { id: string; name: string };
  checkInTime?: string;
  checkOutTime?: string;
  cancellationPolicy: { tiers: HotelCancellationTier[] };
}

export interface BookingPolicies {
  bookingId: string;
  policies: FlightPolicies | HotelPolicies;
  accepted: boolean;
  acceptedAt: string | null;
}

export interface PolicyAcceptanceResult {
  bookingId: string;
  accepted: true;
  acceptedAt: string;
}

const base = (type: PolicyBookingType, id: string) =>
  `/bookings/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;

/** GET /api/bookings/:type/:id/policies */
export function getPolicies(type: PolicyBookingType, bookingId: string): Promise<BookingPolicies> {
  return apiFetch<BookingPolicies>(`${base(type, bookingId)}/policies`);
}

/** POST /api/bookings/:type/:id/accept-policies (the backend stores the timestamp). */
export function acceptPolicies(type: PolicyBookingType, bookingId: string): Promise<PolicyAcceptanceResult> {
  return apiFetch<PolicyAcceptanceResult>(`${base(type, bookingId)}/accept-policies`, { method: "POST" });
}

/**
 * Cancellation tiers in plain words, using the FLT-09 / HTL-10 rule: the tier with the
 * highest threshold not exceeding the days remaining applies; if none applies, 0%.
 */
export function describeCancellationTiers(
  tiers: Array<{ days: number; percent: number }>,
  event: "departure" | "check-in",
): string[] {
  if (tiers.length === 0) return ["Cancellations are not refunded."];
  const sorted = [...tiers].sort((a, b) => b.days - a.days);
  const dayWord = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  const lines = sorted.map(({ days, percent }, i) => {
    let when = `Cancelled at least ${dayWord(days)} before ${event}`;
    if (days === 0) {
      const previous = sorted[i - 1]?.days;
      when = previous ? `Cancelled less than ${dayWord(previous)} before ${event}` : `Cancelled any time before ${event}`;
    }
    return `${when}: ${percent === 0 ? "no refund" : `${percent}% refund`}`;
  });
  const lowest = sorted[sorted.length - 1].days;
  if (lowest > 0) {
    lines.push(`Cancelled less than ${lowest} ${lowest === 1 ? "day" : "days"} before ${event}: no refund`);
  }
  return lines;
}
