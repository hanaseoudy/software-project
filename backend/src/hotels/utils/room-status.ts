const DAY_MS = 24 * 60 * 60 * 1000;

/** HTL-08: what a room is doing on a given day. */
export enum RoomDayStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED = 'BOOKED',
  BLOCKED = 'BLOCKED',
}

/** One stretch of days (both included) that a bookable range, a block or a reservation covers. */
export interface StatusInterval {
  status: RoomDayStatus;
  from: Date;
  to: Date;
  /** Reservation reference, only for BOOKED. */
  reference?: string;
  /** Reservation status, only for BOOKED. */
  reservationStatus?: string;
}

export interface StatusPeriod {
  status: RoomDayStatus;
  startDate: string;
  endDate: string;
  reservationReference?: string;
  reservationStatus?: string;
}

// When two things cover the same day, the reservation is the most important to show,
// then a block, then plain availability.
const PRIORITY: Record<RoomDayStatus, number> = {
  [RoomDayStatus.BOOKED]: 3,
  [RoomDayStatus.BLOCKED]: 2,
  [RoomDayStatus.AVAILABLE]: 1,
};

const dayNumber = (date: Date): number => Math.floor(date.getTime() / DAY_MS);
const dayString = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

/**
 * HTL-08: the status of one room for the chosen days (both days included), as a list of
 * periods in date order. Neighbouring days with the same status (and the same reservation)
 * are joined into one period. Days that no bookable range, block or reservation covers
 * have no status and are left out.
 */
export function buildRoomStatusPeriods(
  rangeStart: Date,
  rangeEnd: Date,
  intervals: StatusInterval[],
): StatusPeriod[] {
  const first = dayNumber(rangeStart);
  const end = dayNumber(rangeEnd) + 1; // exclusive

  const clipped = intervals
    .map((interval) => ({
      ...interval,
      start: Math.max(dayNumber(interval.from), first),
      stop: Math.min(dayNumber(interval.to) + 1, end), // exclusive
    }))
    .filter((interval) => interval.stop > interval.start);

  const boundaries = [
    ...new Set(clipped.flatMap((interval) => [interval.start, interval.stop])),
  ].sort((a, b) => a - b);

  const periods: (StatusPeriod & { stop: number })[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const stop = boundaries[i + 1];
    let winner: (typeof clipped)[number] | undefined;
    for (const interval of clipped) {
      if (interval.start > start || interval.stop < stop) {
        continue;
      }
      if (!winner || PRIORITY[interval.status] > PRIORITY[winner.status]) {
        winner = interval;
      }
    }
    if (!winner) {
      continue;
    }

    const last = periods[periods.length - 1];
    if (
      last &&
      last.stop === start &&
      last.status === winner.status &&
      last.reservationReference === winner.reference
    ) {
      last.endDate = dayString(stop - 1);
      last.stop = stop;
      continue;
    }
    periods.push({
      status: winner.status,
      startDate: dayString(start),
      endDate: dayString(stop - 1),
      ...(winner.reference === undefined
        ? {}
        : {
            reservationReference: winner.reference,
            reservationStatus: winner.reservationStatus,
          }),
      stop,
    });
  }

  return periods.map(({ stop: _stop, ...period }) => period);
}
