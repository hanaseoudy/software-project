const DAY_MS = 24 * 60 * 60 * 1000;

/** Framework-free error so these rules can be unit-tested without NestJS. */
export class HotelBookingRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HotelBookingRuleError';
  }
}

export interface GuestAllocation {
  roomId: string;
  adults: number;
  children: number;
}

export interface RoomInfo {
  roomId: string;
  hotelId: string;
  maxOccupancy: number;
  pricePerNight: number;
}

export interface ReservationLine {
  roomId: string;
  pricePerNight: number;
  adults: number;
  children: number;
  subtotal: number;
}

export interface ReservationSummary {
  nights: number;
  lines: ReservationLine[];
  totalPrice: number;
}

/** Whole nights between two dates (UTC days). Must be at least 1. */
export function countNights(checkIn: Date, checkOut: Date): number {
  const nights = Math.round(
    (Date.UTC(
      checkOut.getUTCFullYear(),
      checkOut.getUTCMonth(),
      checkOut.getUTCDate(),
    ) -
      Date.UTC(
        checkIn.getUTCFullYear(),
        checkIn.getUTCMonth(),
        checkIn.getUTCDate(),
      )) /
      DAY_MS,
  );
  if (nights < 1) {
    throw new HotelBookingRuleError('checkOut must be after checkIn');
  }
  return nights;
}

/** HTL-16: guest counts are whole numbers (children are ages 0-17). */
export function assertValidGuestCounts(allocations: GuestAllocation[]): void {
  for (const a of allocations) {
    if (
      !Number.isInteger(a.adults) ||
      !Number.isInteger(a.children) ||
      a.adults < 0 ||
      a.children < 0
    ) {
      throw new HotelBookingRuleError(
        'Adults and children must be whole numbers of 0 or more',
      );
    }
  }
}

/** HTL-16: at least one adult per RESERVATION (not per room). */
export function assertAtLeastOneAdult(allocations: GuestAllocation[]): void {
  const adults = allocations.reduce((sum, a) => sum + a.adults, 0);
  if (adults < 1) {
    throw new HotelBookingRuleError(
      'At least one adult is required per reservation',
    );
  }
}

/** HTL-16: one reservation = a set of distinct rooms. */
export function assertDistinctRooms(allocations: GuestAllocation[]): void {
  const ids = allocations.map((a) => a.roomId);
  if (new Set(ids).size !== ids.length) {
    throw new HotelBookingRuleError('Each room can be selected only once');
  }
}

/** HTL-16: all rooms must belong to the same hotel. */
export function assertSameHotel(rooms: RoomInfo[], hotelId: string): void {
  if (rooms.some((r) => r.hotelId !== hotelId)) {
    throw new HotelBookingRuleError(
      'All rooms must belong to the selected hotel',
    );
  }
}

/** HTL-16: a room's guests may not exceed its maximum occupancy. */
export function assertWithinOccupancy(
  allocation: GuestAllocation,
  room: RoomInfo,
): void {
  if (allocation.adults + allocation.children > room.maxOccupancy) {
    throw new HotelBookingRuleError(
      `Room ${room.roomId} allows at most ${room.maxOccupancy} guests`,
    );
  }
}

/** HTL-16: total = sum over rooms of nights x that room's price at booking time. */
export function calculateTotalPrice(
  pricesPerNight: number[],
  nights: number,
): number {
  const total = pricesPerNight.reduce((sum, p) => sum + p * nights, 0);
  return Math.round(total * 100) / 100;
}

/**
 * HTL-16: validates a multi-room reservation and prices it. `rooms` are the
 * rooms as currently stored (their price is captured at booking time).
 */
export function buildReservation(input: {
  hotelId: string;
  checkIn: Date;
  checkOut: Date;
  allocations: GuestAllocation[];
  rooms: RoomInfo[];
}): ReservationSummary {
  const { hotelId, checkIn, checkOut, allocations, rooms } = input;

  if (allocations.length < 1) {
    throw new HotelBookingRuleError('Select at least one room');
  }
  const nights = countNights(checkIn, checkOut);
  assertValidGuestCounts(allocations);
  assertDistinctRooms(allocations);
  assertAtLeastOneAdult(allocations);
  assertSameHotel(rooms, hotelId);

  const byId = new Map(rooms.map((r) => [r.roomId, r]));
  const lines = allocations.map((allocation) => {
    const room = byId.get(allocation.roomId);
    if (!room) {
      throw new HotelBookingRuleError(
        `Room ${allocation.roomId} was not found`,
      );
    }
    assertWithinOccupancy(allocation, room);
    return {
      roomId: room.roomId,
      pricePerNight: room.pricePerNight,
      adults: allocation.adults,
      children: allocation.children,
      subtotal: room.pricePerNight * nights,
    };
  });

  return {
    nights,
    lines,
    totalPrice: calculateTotalPrice(
      lines.map((l) => l.pricePerNight),
      nights,
    ),
  };
}
