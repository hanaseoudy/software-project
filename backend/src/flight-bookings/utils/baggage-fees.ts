// FLT-19: baggage rules and fees. Pure functions (no Nest/Mongoose imports) so they
// are easy to test and can be reused by the booking service and the summary (FLT-21).

export class BaggageRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaggageRuleError';
  }
}

export interface BaggagePolicyInfo {
  extraBagPrice: number; // price per extra bag
  maxExtraBagsPerPassenger: number;
  maxBagWeightKg: number; // same max weight as the cabin's free allowance (FLT-08)
}

export interface PassengerBaggage {
  extraBagWeightsKg: number[]; // one entry per extra bag
}

export interface PassengerBaggageFee {
  extraBags: number;
  fee: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function assertBaggageWithinPolicy(
  baggage: PassengerBaggage,
  policy: BaggagePolicyInfo,
): void {
  const count = baggage.extraBagWeightsKg.length;
  if (count > policy.maxExtraBagsPerPassenger) {
    throw new BaggageRuleError(
      `A passenger can add at most ${policy.maxExtraBagsPerPassenger} extra bag(s)`,
    );
  }
  for (const weight of baggage.extraBagWeightsKg) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new BaggageRuleError(
        'Each extra bag must have a weight greater than 0',
      );
    }
    if (weight > policy.maxBagWeightKg) {
      throw new BaggageRuleError(
        `An extra bag cannot weigh more than ${policy.maxBagWeightKg} kg`,
      );
    }
  }
}

export function calculatePassengerBaggageFee(
  baggage: PassengerBaggage,
  policy: BaggagePolicyInfo,
): PassengerBaggageFee {
  assertBaggageWithinPolicy(baggage, policy);
  const extraBags = baggage.extraBagWeightsKg.length;
  return { extraBags, fee: round2(extraBags * policy.extraBagPrice) };
}

export function calculateBaggageFees(
  passengers: PassengerBaggage[],
  policy: BaggagePolicyInfo,
): { perPassenger: PassengerBaggageFee[]; total: number } {
  const perPassenger = passengers.map((p) =>
    calculatePassengerBaggageFee(p, policy),
  );
  const total = round2(perPassenger.reduce((sum, p) => sum + p.fee, 0));
  return { perPassenger, total };
}

// Baggage fee is added to the booking total (fare + baggage).
export function calculateBookingTotal(
  fareTotal: number,
  baggageTotal: number,
): number {
  if (fareTotal < 0 || baggageTotal < 0) {
    throw new BaggageRuleError('Totals cannot be negative');
  }
  return round2(fareTotal + baggageTotal);
}

// ---- Booking integration (used by createHold) ----

export interface CabinBaggageAllowance {
  freeBags: number; // free bags per passenger in this cabin (FLT-04)
  maxBagWeightKg: number; // max weight per bag, also for extra bags (FLT-08)
}

export interface PassengerBagInput {
  weightKg: number;
  isExtra?: boolean;
}

export interface PassengerBagsInput {
  baggage?: PassengerBagInput[];
}

export interface AirlineBaggagePolicy {
  extraBagPrice?: number;
  maxExtraBagsPerPassenger?: number;
}

/** Free bags must fit the cabin's allowance (count and weight per bag). */
export function assertFreeBagsWithinAllowance(
  freeBagWeightsKg: number[],
  cabin: CabinBaggageAllowance,
): void {
  if (freeBagWeightsKg.length > cabin.freeBags) {
    throw new BaggageRuleError(
      `A passenger can take at most ${cabin.freeBags} free bag(s) in this cabin; additional bags must be marked as extra`,
    );
  }
  for (const weight of freeBagWeightsKg) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new BaggageRuleError('Each bag must have a weight greater than 0');
    }
    if (weight > cabin.maxBagWeightKg) {
      throw new BaggageRuleError(
        `A bag cannot weigh more than ${cabin.maxBagWeightKg} kg`,
      );
    }
  }
}

/**
 * Validates every passenger's bags for one flight leg and returns the extra
 * baggage fees. Free bags are checked against the cabin allowance (FLT-04);
 * extra bags against the airline's baggage policy (FLT-08).
 */
export function calculateLegBaggageFees(
  passengers: PassengerBagsInput[],
  cabin: CabinBaggageAllowance,
  airlinePolicy: AirlineBaggagePolicy | undefined,
): { perPassenger: PassengerBaggageFee[]; total: number } {
  const policy: BaggagePolicyInfo = {
    extraBagPrice: airlinePolicy?.extraBagPrice ?? 0,
    maxExtraBagsPerPassenger: airlinePolicy?.maxExtraBagsPerPassenger ?? 0,
    maxBagWeightKg: cabin.maxBagWeightKg,
  };

  const extraBags: PassengerBaggage[] = passengers.map((p) => {
    const bags = p.baggage ?? [];
    assertFreeBagsWithinAllowance(
      bags.filter((b) => !b.isExtra).map((b) => b.weightKg),
      cabin,
    );
    return {
      extraBagWeightsKg: bags.filter((b) => b.isExtra).map((b) => b.weightKg),
    };
  });

  return calculateBaggageFees(extraBags, policy);
}
