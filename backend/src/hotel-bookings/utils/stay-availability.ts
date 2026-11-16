const DAY_MS = 24 * 60 * 60 * 1000;

export interface AvailableRange {
  startDate: Date;
  endDate: Date;
}

function utcDay(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/**
 * HTL-18: true only if EVERY night of the stay [checkIn, checkOut) falls
 * inside one of the room's `available` ranges (ranges may be adjacent or
 * overlapping; a gap anywhere makes the stay unavailable).
 *
 * Assumption: a range's endDate is INCLUSIVE (the last available night).
 */
export function isStayFullyAvailable(
  checkIn: Date,
  checkOut: Date,
  ranges: AvailableRange[],
): boolean {
  const first = utcDay(checkIn);
  const end = utcDay(checkOut); // exclusive: the checkout day is not a night
  if (end <= first) return false;

  const sorted = ranges
    .map((r) => ({ start: utcDay(r.startDate), end: utcDay(r.endDate) }))
    .filter((r) => r.end >= r.start)
    .sort((a, b) => a.start - b.start);

  let cursor = first; // first night not yet covered
  for (const range of sorted) {
    if (range.start > cursor) break; // gap before this range
    if (range.end >= cursor) cursor = range.end + 1;
    if (cursor >= end) return true;
  }
  return cursor >= end;
}
