// FLT-21: builds the booking summary shown before payment. Pure (no database or
// framework imports) so it can be unit-tested on its own.

export interface SummaryAirport {
  iataCode: string;
  name: string;
  city: string;
  timezone: string;
}

export interface SummaryFlight {
  flightNumber: string;
  airlineName: string;
  departureAirport: SummaryAirport;
  arrivalAirport: SummaryAirport;
  departureTime: Date;
  arrivalTime: Date;
  durationMinutes: number;
}

export interface SummaryBaggageItem {
  weightKg: number;
  isExtra?: boolean;
}

export interface SummaryPassenger {
  firstName: string;
  lastName: string;
  type: string;
  dateOfBirth: Date;
  documentType: string;
  documentNumber: string;
  baggage?: SummaryBaggageItem[];
}

export interface SummaryBooking {
  id: string;
  status: string;
  tripType: string;
  cabinClass: string;
  currency: string;
  totalPrice: number; // seat fares
  baggageFees?: number; // FLT-19 baggage fees
  holdExpiresAt?: Date;
  passengers: SummaryPassenger[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function buildBookingSummary(
  booking: SummaryBooking,
  outbound: SummaryFlight,
  returnFlight: SummaryFlight | undefined,
  now: Date = new Date(),
) {
  const baggageFees = round2(booking.baggageFees ?? 0);
  const fareTotal = round2(booking.totalPrice);

  const passengers = booking.passengers.map((p) => {
    const bags = p.baggage ?? [];
    return {
      firstName: p.firstName,
      lastName: p.lastName,
      type: p.type,
      dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10),
      documentType: p.documentType,
      documentNumber: p.documentNumber,
      baggage: bags.map((b) => ({ weightKg: b.weightKg, isExtra: b.isExtra ?? false })),
      extraBags: bags.filter((b) => b.isExtra).length,
    };
  });

  const flights = [
    { segment: 'OUTBOUND', ...outbound },
    ...(returnFlight ? [{ segment: 'RETURN', ...returnFlight }] : []),
  ];

  return {
    bookingId: booking.id,
    status: booking.status,
    tripType: booking.tripType,
    cabinClass: booking.cabinClass,
    holdExpiresAt: booking.holdExpiresAt ?? null,
    canPay:
      booking.status === 'PENDING_PAYMENT' &&
      !!booking.holdExpiresAt &&
      booking.holdExpiresAt.getTime() > now.getTime(),
    flights,
    passengers,
    baggage: {
      extraBags: passengers.reduce((sum, p) => sum + p.extraBags, 0),
      fees: baggageFees,
    },
    pricing: {
      currency: booking.currency,
      fareTotal,
      baggageFees,
      // Same amount PAY-01 charges: seat fares + baggage fees.
      total: round2(fareTotal + baggageFees),
    },
  };
}
