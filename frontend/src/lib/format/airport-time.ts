// GEN-06: show flight times in each airport's local time zone.
//
// The backend stores flight times in UTC and each airport has an IANA
// `timezone` (e.g. "Africa/Cairo"). Always pass the time zone of the airport
// the time belongs to: departure time -> departure airport, arrival time ->
// arrival airport. Never format flight times in the browser's own time zone.
//
// The text is assembled from Intl parts with a fixed layout, so the server and
// every browser produce exactly the same string (no hydration mismatch from
// locale punctuation differences).

type DateInput = string | number | Date;

export interface AirportTimeOptions {
  /** Adds the zone, e.g. "GMT+2", so users know which local time they see. */
  showZone?: boolean;
}

type Parts = Partial<Record<Intl.DateTimeFormatPartTypes, string>>;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

function parts(value: DateInput, timeZone: string, showZone = false): Parts {
  if (!timeZone) throw new RangeError("An airport time zone is required (GEN-06).");
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(showZone ? { timeZoneName: "shortOffset" } : {}),
  });
  const result: Parts = {};
  for (const part of formatter.formatToParts(toDate(value))) result[part.type] = part.value;
  return result;
}

function time(p: Parts, showZone?: boolean): string {
  const hhmm = `${p.hour}:${p.minute}`;
  if (!showZone || !p.timeZoneName) return hhmm;
  // Engines differ on zero offset ("GMT", "GMT+0", "UTC"); always show "GMT".
  const zone = /^(GMT|UTC)([+-]0(:00)?)?$/.test(p.timeZoneName) ? "GMT" : p.timeZoneName;
  return `${hhmm} ${zone}`;
}

function date(p: Parts): string {
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

/** "Sat 5 Dec 2026, 10:00" in the airport's local time. */
export function formatAirportDateTime(value: DateInput, timeZone: string, options: AirportTimeOptions = {}): string {
  const p = parts(value, timeZone, options.showZone);
  return `${date(p)}, ${time(p, options.showZone)}`;
}

/** "10:00" in the airport's local time. */
export function formatAirportTime(value: DateInput, timeZone: string, options: AirportTimeOptions = {}): string {
  return time(parts(value, timeZone, options.showZone), options.showZone);
}

/** "Sat 5 Dec 2026" in the airport's local time. */
export function formatAirportDate(value: DateInput, timeZone: string): string {
  return date(parts(value, timeZone));
}
