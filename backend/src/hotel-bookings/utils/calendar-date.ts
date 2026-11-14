const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a strict `YYYY-MM-DD` real calendar date into a UTC-midnight Date.
 * Returns null for anything else: timestamps, time zones, other formats, or
 * impossible dates such as 2027-02-30.
 */
export function parseCalendarDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = CALENDAR_DATE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC rolls invalid days over (Feb 30 -> Mar 2), so verify the round trip.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isCalendarDate(value: unknown): boolean {
  return parseCalendarDate(value) !== null;
}
