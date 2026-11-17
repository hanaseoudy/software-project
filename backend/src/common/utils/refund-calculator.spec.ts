import { refundPercentFor, CancellationRule } from './refund-calculator';

describe('refundPercentFor', () => {
  const sampleRules: CancellationRule[] = [
    { daysBeforeDeparture: 14, refundPercent: 100 },
    { daysBeforeDeparture: 7, refundPercent: 50 },
    { daysBeforeDeparture: 2, refundPercent: 20 },
  ];

  it('should return 0% if the rules array is empty or undefined', () => {
    expect(refundPercentFor(10, [])).toBe(0);
    expect(refundPercentFor(10, undefined as any)).toBe(0);
  });

  it('should return 0% if no tier threshold is met (days remaining too low)', () => {
    // 1 day remaining, but lowest tier is 2 days
    expect(refundPercentFor(1, sampleRules)).toBe(0);
    expect(refundPercentFor(0, sampleRules)).toBe(0);
  });

  it('should match the exact threshold when days remaining equal a tier threshold', () => {
    // Exactly 7 days remaining should hit the 7-day tier (50%)
    expect(refundPercentFor(7, sampleRules)).toBe(50);
    expect(refundPercentFor(14, sampleRules)).toBe(100);
  });

  it('should select the tier with the highest threshold not exceeding days remaining', () => {
    // 20 days remaining qualifies for 14, 7, and 2 day tiers -> highest is 14 (100%)
    expect(refundPercentFor(20, sampleRules)).toBe(100);

    // 10 days remaining qualifies for 7 and 2 day tiers -> highest is 7 (50%)
    expect(refundPercentFor(10, sampleRules)).toBe(50);

    // 3 days remaining qualifies for 2 day tier only (20%)
    expect(refundPercentFor(3, sampleRules)).toBe(20);
  });

  it('should handle unsorted rules correctly', () => {
    const unsortedRules: CancellationRule[] = [
      { daysBeforeDeparture: 2, refundPercent: 20 },
      { daysBeforeDeparture: 14, refundPercent: 100 },
      { daysBeforeDeparture: 7, refundPercent: 50 },
    ];

    expect(refundPercentFor(10, unsortedRules)).toBe(50);
    expect(refundPercentFor(30, unsortedRules)).toBe(100);
  });
});
