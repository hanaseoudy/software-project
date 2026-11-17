export interface CancellationRule {
  daysBeforeDeparture: number; // Or days before check-in for hotels
  refundPercent: number;
}

/**
 * Calculates the applicable refund percentage based on remaining days and cancellation tiers.
 * Selects the tier with the highest threshold that does not exceed the days remaining.
 * Returns 0% if no tier applies or rules are empty.
 */
export function refundPercentFor(
  daysRemaining: number,
  rules: CancellationRule[] = [],
): number {
  if (!rules || rules.length === 0) {
    return 0;
  }

  // 1. Filter rules where the threshold does not exceed the days remaining
  const validTiers = rules.filter(
    (rule) => rule.daysBeforeDeparture <= daysRemaining,
  );

  // 2. If no tiers apply, refund is 0%
  if (validTiers.length === 0) {
    return 0;
  }

  // 3. Find the tier with the highest threshold among the valid ones
  const highestTier = validTiers.reduce((max, current) =>
    current.daysBeforeDeparture > max.daysBeforeDeparture ? current : max,
  );

  return highestTier.refundPercent;
}
