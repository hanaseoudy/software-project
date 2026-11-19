const DAY_MS = 24 * 60 * 60 * 1000;

/** FLT-26: a flight booking can only be cancelled before its first flight departs. */
export function hasDeparted(departureTime: Date, now: Date): boolean {
  return departureTime.getTime() <= now.getTime();
}

/** Whole days from now until departure (used to pick the FLT-09 cancellation tier). */
export function wholeDaysUntil(departureTime: Date, now: Date): number {
  return Math.max(
    0,
    Math.floor((departureTime.getTime() - now.getTime()) / DAY_MS),
  );
}
