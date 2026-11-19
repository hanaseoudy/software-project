import { Types } from 'mongoose';
import {
  chargeTotal,
  fareDifference,
  fareOutcome,
  isSameRoute,
  legFare,
} from './flight-change';

describe('legFare', () => {
  it('charges adults and children the fare and infants 10%', () => {
    expect(legFare(100, 2, 1)).toBeCloseTo(210);
    expect(legFare(100, 1, 0)).toBe(100);
  });
});

describe('chargeTotal', () => {
  it('adds fares and baggage fees, rounded to cents', () => {
    expect(chargeTotal(100.005, 20)).toBe(120.01);
    expect(chargeTotal(100)).toBe(100);
  });
});

describe('fareDifference / fareOutcome', () => {
  it('is positive when the new fare is higher', () => {
    const diff = fareDifference(120, 150.5);
    expect(diff).toBe(30.5);
    expect(fareOutcome(diff)).toBe('PAY_DIFFERENCE');
  });

  it('is negative when the new fare is lower', () => {
    const diff = fareDifference(120, 90);
    expect(diff).toBe(-30);
    expect(fareOutcome(diff)).toBe('REFUND_DIFFERENCE');
  });

  it('is zero for the same price and avoids float noise', () => {
    expect(fareDifference(0.3, 0.1 + 0.2)).toBe(0);
    expect(fareOutcome(0)).toBe('NO_PAYMENT');
  });
});

describe('isSameRoute', () => {
  const cai = new Types.ObjectId();
  const dxb = new Types.ObjectId();
  const lhr = new Types.ObjectId();

  it('is true for the same airports in the same direction', () => {
    expect(
      isSameRoute(
        { departureAirport: cai, arrivalAirport: dxb },
        { departureAirport: cai, arrivalAirport: dxb },
      ),
    ).toBe(true);
  });

  it('is false for a different destination or the reverse direction', () => {
    expect(
      isSameRoute(
        { departureAirport: cai, arrivalAirport: dxb },
        { departureAirport: cai, arrivalAirport: lhr },
      ),
    ).toBe(false);
    expect(
      isSameRoute(
        { departureAirport: cai, arrivalAirport: dxb },
        { departureAirport: dxb, arrivalAirport: cai },
      ),
    ).toBe(false);
  });
});
