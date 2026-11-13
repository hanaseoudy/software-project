import {
  assertAtLeastOneAdult,
  assertDistinctRooms,
  assertSameHotel,
  assertValidGuestCounts,
  assertWithinOccupancy,
  buildReservation,
  calculateTotalPrice,
  countNights,
  HotelBookingRuleError,
} from './hotel-booking-rules';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const room = (
  roomId: string,
  price = 100,
  maxOccupancy = 2,
  hotelId = 'h1',
) => ({
  roomId,
  hotelId,
  maxOccupancy,
  pricePerNight: price,
});

describe('countNights', () => {
  it('counts whole nights', () => {
    expect(countNights(d('2027-03-10'), d('2027-03-13'))).toBe(3);
    expect(countNights(d('2027-12-31'), d('2028-01-01'))).toBe(1);
  });

  it('rejects checkOut that is not after checkIn', () => {
    expect(() => countNights(d('2027-03-10'), d('2027-03-10'))).toThrow(
      HotelBookingRuleError,
    );
    expect(() => countNights(d('2027-03-10'), d('2027-03-09'))).toThrow(
      'checkOut must be after checkIn',
    );
  });
});

describe('guest rules', () => {
  it('requires whole, non-negative guest numbers', () => {
    expect(() =>
      assertValidGuestCounts([{ roomId: 'a', adults: 1.5, children: 0 }]),
    ).toThrow(HotelBookingRuleError);
    expect(() =>
      assertValidGuestCounts([{ roomId: 'a', adults: 1, children: -1 }]),
    ).toThrow(HotelBookingRuleError);
    expect(() =>
      assertValidGuestCounts([{ roomId: 'a', adults: 2, children: 0 }]),
    ).not.toThrow();
  });

  it('needs at least one adult in the whole reservation, not in every room', () => {
    expect(() =>
      assertAtLeastOneAdult([
        { roomId: 'a', adults: 0, children: 2 },
        { roomId: 'b', adults: 0, children: 1 },
      ]),
    ).toThrow('At least one adult is required per reservation');
    expect(() =>
      assertAtLeastOneAdult([
        { roomId: 'a', adults: 0, children: 2 },
        { roomId: 'b', adults: 1, children: 0 },
      ]),
    ).not.toThrow();
  });

  it('does not allow the same room twice', () => {
    expect(() =>
      assertDistinctRooms([
        { roomId: 'a', adults: 1, children: 0 },
        { roomId: 'a', adults: 1, children: 0 },
      ]),
    ).toThrow('Each room can be selected only once');
  });

  it('does not allow more guests than the maximum occupancy', () => {
    const r = room('a', 100, 3);
    expect(() =>
      assertWithinOccupancy({ roomId: 'a', adults: 2, children: 1 }, r),
    ).not.toThrow();
    expect(() =>
      assertWithinOccupancy({ roomId: 'a', adults: 2, children: 2 }, r),
    ).toThrow('allows at most 3 guests');
  });

  it('requires all rooms to be in the selected hotel', () => {
    expect(() =>
      assertSameHotel([room('a'), room('b', 100, 2, 'other')], 'h1'),
    ).toThrow('All rooms must belong to the selected hotel');
    expect(() => assertSameHotel([room('a'), room('b')], 'h1')).not.toThrow();
  });
});

describe('calculateTotalPrice', () => {
  it('is the sum over rooms of nights x price', () => {
    expect(calculateTotalPrice([100, 120], 3)).toBe(660);
  });

  it('rounds to 2 decimals', () => {
    expect(calculateTotalPrice([33.333], 3)).toBe(100);
  });
});

describe('buildReservation', () => {
  const base = {
    hotelId: 'h1',
    checkIn: d('2027-03-10'),
    checkOut: d('2027-03-13'),
  };

  it('prices a two-room reservation with each room price at booking time', () => {
    const result = buildReservation({
      ...base,
      allocations: [
        { roomId: 'a', adults: 2, children: 0 },
        { roomId: 'b', adults: 1, children: 1 },
      ],
      rooms: [room('a', 100), room('b', 120)],
    });
    expect(result.nights).toBe(3);
    expect(result.totalPrice).toBe(660);
    expect(result.lines.map((l) => l.subtotal)).toEqual([300, 360]);
    expect(result.lines[1]).toMatchObject({
      roomId: 'b',
      pricePerNight: 120,
      adults: 1,
      children: 1,
    });
  });

  it('rejects an empty selection', () => {
    expect(() =>
      buildReservation({ ...base, allocations: [], rooms: [] }),
    ).toThrow('Select at least one room');
  });

  it('rejects a room that was not found', () => {
    expect(() =>
      buildReservation({
        ...base,
        allocations: [{ roomId: 'zzz', adults: 1, children: 0 }],
        rooms: [room('a')],
      }),
    ).toThrow('was not found');
  });

  it('rejects a reservation with no adult, too many guests or invalid dates', () => {
    expect(() =>
      buildReservation({
        ...base,
        allocations: [{ roomId: 'a', adults: 0, children: 1 }],
        rooms: [room('a')],
      }),
    ).toThrow('At least one adult');
    expect(() =>
      buildReservation({
        ...base,
        allocations: [{ roomId: 'a', adults: 3, children: 0 }],
        rooms: [room('a', 100, 2)],
      }),
    ).toThrow('allows at most 2 guests');
    expect(() =>
      buildReservation({
        ...base,
        checkOut: d('2027-03-10'),
        allocations: [{ roomId: 'a', adults: 1, children: 0 }],
        rooms: [room('a')],
      }),
    ).toThrow('checkOut must be after checkIn');
  });
});
