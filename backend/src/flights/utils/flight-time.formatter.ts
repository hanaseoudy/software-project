import { formatInTimeZone } from 'date-fns-tz';

export function formatFlightWithLocalTimes(flight: any) {
  if (!flight) return flight;

  // 1. Convert Mongoose Document to a plain JS object so extra fields aren't stripped
  const plain =
    typeof flight.toObject === 'function' ? flight.toObject() : { ...flight };

  const depTimezone: string | undefined = plain.departureAirport?.timezone;
  const arrTimezone: string | undefined = plain.arrivalAirport?.timezone;

  // 2. Guard in case airports weren't populated on a particular query
  if (!depTimezone || !arrTimezone) {
    return plain;
  }

  // 3. Enrich with airport-local times while keeping UTC departureTime/arrivalTime intact
  return {
    ...plain,
    departureLocalTime: formatInTimeZone(
      plain.departureTime,
      depTimezone,
      "yyyy-MM-dd'T'HH:mm:ss",
    ),
    departureTimezone: depTimezone,
    arrivalLocalTime: formatInTimeZone(
      plain.arrivalTime,
      arrTimezone,
      "yyyy-MM-dd'T'HH:mm:ss",
    ),
    arrivalTimezone: arrTimezone,
  };
}
