import {
  BaggageRuleError,
  BaggagePolicyInfo,
  assertBaggageWithinPolicy,
  calculateBaggageFees,
  calculateBookingTotal,
  calculatePassengerBaggageFee,
  assertFreeBagsWithinAllowance,
  calculateLegBaggageFees,
} from './baggage-fees';

const policy: BaggagePolicyInfo = {
  extraBagPrice: 50,
  maxExtraBagsPerPassenger: 2,
  maxBagWeightKg: 23,
};

describe('baggage fees (FLT-19)', () => {
  it('charges nothing when no extra bags are added', () => {
    expect(
      calculatePassengerBaggageFee({ extraBagWeightsKg: [] }, policy),
    ).toEqual({
      extraBags: 0,
      fee: 0,
    });
  });

  it('charges price per extra bag', () => {
    expect(
      calculatePassengerBaggageFee({ extraBagWeightsKg: [20, 23] }, policy),
    ).toEqual({
      extraBags: 2,
      fee: 100,
    });
  });

  it('rejects more bags than the airline maximum', () => {
    expect(() =>
      assertBaggageWithinPolicy({ extraBagWeightsKg: [10, 10, 10] }, policy),
    ).toThrow(BaggageRuleError);
  });

  it('rejects a bag heavier than the maximum weight', () => {
    expect(() =>
      assertBaggageWithinPolicy({ extraBagWeightsKg: [23.5] }, policy),
    ).toThrow('cannot weigh more than 23 kg');
  });

  it('rejects a bag with weight 0 or negative', () => {
    expect(() =>
      assertBaggageWithinPolicy({ extraBagWeightsKg: [0] }, policy),
    ).toThrow(BaggageRuleError);
    expect(() =>
      assertBaggageWithinPolicy({ extraBagWeightsKg: [-5] }, policy),
    ).toThrow(BaggageRuleError);
  });

  it('allows no extra bags when the airline maximum is 0', () => {
    const none = { ...policy, maxExtraBagsPerPassenger: 0 };
    expect(() =>
      assertBaggageWithinPolicy({ extraBagWeightsKg: [5] }, none),
    ).toThrow(BaggageRuleError);
  });

  it('sums the fees of several passengers', () => {
    const result = calculateBaggageFees(
      [
        { extraBagWeightsKg: [10] },
        { extraBagWeightsKg: [] },
        { extraBagWeightsKg: [20, 20] },
      ],
      policy,
    );
    expect(result.perPassenger.map((p) => p.fee)).toEqual([50, 0, 100]);
    expect(result.total).toBe(150);
  });

  it('adds the baggage total to the booking total', () => {
    expect(calculateBookingTotal(1200, 150)).toBe(1350);
  });

  it('rejects negative totals', () => {
    expect(() => calculateBookingTotal(-1, 0)).toThrow(BaggageRuleError);
  });
});

describe('assertFreeBagsWithinAllowance', () => {
  const cabin = { freeBags: 1, maxBagWeightKg: 23 };

  it('accepts free bags within the cabin allowance', () => {
    expect(() => assertFreeBagsWithinAllowance([23], cabin)).not.toThrow();
    expect(() => assertFreeBagsWithinAllowance([], cabin)).not.toThrow();
  });

  it('rejects more free bags than the cabin allows', () => {
    expect(() => assertFreeBagsWithinAllowance([10, 10], cabin)).toThrow(BaggageRuleError);
  });

  it('rejects a free bag heavier than the cabin maximum', () => {
    expect(() => assertFreeBagsWithinAllowance([24], cabin)).toThrow(BaggageRuleError);
  });

  it('rejects a bag with no weight', () => {
    expect(() => assertFreeBagsWithinAllowance([0], cabin)).toThrow(BaggageRuleError);
  });
});

describe('calculateLegBaggageFees', () => {
  const cabin = { freeBags: 1, maxBagWeightKg: 23 };
  const policy = { extraBagPrice: 30, maxExtraBagsPerPassenger: 2 };

  it('charges the airline price for every extra bag and nothing for free bags', () => {
    const result = calculateLegBaggageFees(
      [
        { baggage: [{ weightKg: 20 }, { weightKg: 15, isExtra: true }, { weightKg: 10, isExtra: true }] },
        { baggage: [{ weightKg: 22 }] },
        {},
      ],
      cabin,
      policy,
    );

    expect(result.perPassenger.map((p) => p.extraBags)).toEqual([2, 0, 0]);
    expect(result.total).toBe(60);
  });

  it('rejects more extra bags than the airline policy allows', () => {
    expect(() =>
      calculateLegBaggageFees(
        [{ baggage: [{ weightKg: 5, isExtra: true }, { weightKg: 5, isExtra: true }, { weightKg: 5, isExtra: true }] }],
        cabin,
        policy,
      ),
    ).toThrow(BaggageRuleError);
  });

  it('rejects an extra bag heavier than the cabin maximum', () => {
    expect(() =>
      calculateLegBaggageFees([{ baggage: [{ weightKg: 30, isExtra: true }] }], cabin, policy),
    ).toThrow(BaggageRuleError);
  });

  it('rejects more free bags than the cabin allows (they must be marked extra)', () => {
    expect(() =>
      calculateLegBaggageFees([{ baggage: [{ weightKg: 10 }, { weightKg: 10 }] }], cabin, policy),
    ).toThrow(BaggageRuleError);
  });

  it('allows no extra bags when the airline has no baggage policy', () => {
    expect(() =>
      calculateLegBaggageFees([{ baggage: [{ weightKg: 5, isExtra: true }] }], cabin, undefined),
    ).toThrow(BaggageRuleError);
  });
});
