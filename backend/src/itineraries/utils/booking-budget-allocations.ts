import { formatInTimeZone } from 'date-fns-tz';
import { PLATFORM_CURRENCY } from '../../common/constants/currency.constants';
import { BookingAllocationDto } from '../dto/itinerary-booking-link-response.dto';

export function moneyCents(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('Invalid monetary amount');
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw new Error('Invalid monetary precision');
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Unsafe monetary amount');
  return cents;
}
export function centsAmount(value: bigint): number {
  const amount = Number(value) / 100;
  if (moneyCents(amount) !== value)
    throw new Error('Unsafe monetary precision');
  return amount;
}
export function allocateBooking(input: {
  type: string;
  booking: any;
  days: { _id: unknown; dayNumber: number; cityId: string }[];
  selected: string[];
  startDate: Date;
  flights: Map<string, any>;
  airports: Map<string, any>;
  hotels: Map<string, any>;
  cities: Map<string, any>;
}): { amount: number; allocations: BookingAllocationDto[] } {
  const { booking, type } = input;
  if (booking.currency !== PLATFORM_CURRENCY)
    throw new Error('Invalid booking currency');
  let cents = moneyCents(booking.totalPrice);
  if (type === 'flight') cents += moneyCents(booking.baggageFees ?? 0);
  const amount = centsAmount(cents);
  const selected = input.days
    .filter((day) => input.selected.includes(String(day._id)))
    .sort((a, b) => a.dayNumber - b.dayNumber);
  if (
    new Set(input.selected).size !== input.selected.length ||
    selected.length !== input.selected.length ||
    !selected.length
  )
    throw new Error('Invalid day association');
  const dated = (day: (typeof selected)[number]) => {
    const date = new Date(input.startDate);
    date.setUTCDate(date.getUTCDate() + day.dayNumber - 1);
    if (!Number.isFinite(date.getTime()))
      throw new Error('Invalid itinerary date');
    return date.toISOString().slice(0, 10);
  };
  if (type === 'flight') {
    // Only the actual supported direct outboundFlight and optional reverse
    // returnFlight are authoritative. Never guess connecting/extra segments.
    if (
      !['ONE_WAY', 'ROUND_TRIP'].includes(booking.tripType) ||
      !booking.outboundFlight ||
      Array.isArray(booking.outboundFlight) ||
      Array.isArray(booking.returnFlight) ||
      (booking.tripType === 'ROUND_TRIP' && !booking.returnFlight) ||
      (booking.tripType === 'ONE_WAY' && booking.returnFlight) ||
      [
        'segments',
        'legs',
        'outboundFlights',
        'outboundSegments',
        'returnSegments',
      ].some((key) => booking[key] !== undefined)
    )
      throw new Error('Unsupported flight booking structure');
    const outbound = input.flights.get(String(booking.outboundFlight));
    const returning = booking.returnFlight
      ? input.flights.get(String(booking.returnFlight))
      : null;
    if (
      !outbound ||
      !Number.isFinite(new Date(outbound.departureTime).getTime()) ||
      !Number.isFinite(new Date(outbound.arrivalTime).getTime()) ||
      new Date(outbound.arrivalTime) <= new Date(outbound.departureTime) ||
      outbound.status === 'CANCELLED'
    )
      throw new Error('Flight unavailable');
    const departure = input.airports.get(String(outbound.departureAirport));
    const arrival = input.airports.get(String(outbound.arrivalAirport));
    const canonical = arrival && input.cities.get(arrival.city);
    if (
      !departure ||
      !arrival ||
      !canonical ||
      canonical.countryCode !== arrival.country ||
      String(outbound.departureAirport) === String(outbound.arrivalAirport)
    )
      throw new Error('Invalid canonical flight route');
    if (
      booking.returnFlight &&
      (!returning ||
        !Number.isFinite(new Date(returning.departureTime).getTime()) ||
        returning.status === 'CANCELLED' ||
        String(returning.departureAirport) !==
          String(outbound.arrivalAirport) ||
        String(returning.arrivalAirport) !==
          String(outbound.departureAirport) ||
        new Date(returning.departureTime) <= new Date(outbound.arrivalTime))
    )
      throw new Error('Invalid direct return route');
    const arrivalDate = formatInTimeZone(
      new Date(outbound.arrivalTime),
      arrival.timezone,
      'yyyy-MM-dd',
    );
    if (
      selected.length !== 1 ||
      selected[0].cityId !== arrival.city ||
      dated(selected[0]) !== arrivalDate
    )
      throw new Error('Outbound arrival does not match the selected day');
    return {
      amount,
      allocations: [
        {
          dayId: String(selected[0]._id),
          date: arrivalDate,
          category: 'INTERCITY_TRANSPORT',
          amount,
        },
      ],
    };
  }
  if (type !== 'hotel') throw new Error('Unsupported booking type');
  const hotel = input.hotels.get(String(booking.hotel)),
    city = hotel && input.cities.get(String(hotel.city));
  const checkIn = new Date(booking.checkIn),
    checkOut = new Date(booking.checkOut);
  const nights = (checkOut.getTime() - checkIn.getTime()) / 86400000;
  if (
    !city ||
    !Number.isInteger(nights) ||
    nights < 1 ||
    nights > 60 ||
    checkIn.getUTCHours() ||
    checkIn.getUTCMinutes() ||
    checkIn.getUTCSeconds() ||
    checkIn.getUTCMilliseconds() ||
    checkOut.getUTCHours() ||
    checkOut.getUTCMinutes() ||
    checkOut.getUTCSeconds() ||
    checkOut.getUTCMilliseconds() ||
    selected.length !== nights
  )
    throw new Error('Select the full hotel stay');
  const quotient = cents / BigInt(nights),
    remainder = cents % BigInt(nights);
  return {
    amount,
    allocations: selected.map((day, index) => {
      const expected = new Date(checkIn);
      expected.setUTCDate(expected.getUTCDate() + index);
      const date = dated(day);
      if (
        day.cityId !== city.cityId ||
        date !== expected.toISOString().slice(0, 10)
      )
        throw new Error('Hotel stay dates/city do not match selected days');
      return {
        dayId: String(day._id),
        date,
        category: 'ACCOMMODATION',
        amount: centsAmount(quotient + (BigInt(index) < remainder ? 1n : 0n)),
      };
    }),
  };
}
