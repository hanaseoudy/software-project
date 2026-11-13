import {
  BaggageRuleError,
  BaggagePolicyInfo,
  assertBaggageWithinPolicy,
  calculateBaggageFees,
  calculateBookingTotal,
  calculatePassengerBaggageFee,
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
