import { Mongoose } from 'mongoose';
import { PLATFORM_CURRENCY } from '../../common/constants/currency.constants';
import { Airline, AirlineSchema } from './airline.schema';

describe('Shared Airline schema (FLT-01 / PAY-04)', () => {
  const mongoose = new Mongoose();
  const airlineModel = mongoose.model(Airline.name, AirlineSchema);

  it('keeps the existing collection, unique indexes, and timestamps', () => {
    expect(airlineModel.collection.name).toBe('airlines');
    expect(AirlineSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ name: 1 }, expect.objectContaining({ unique: true })],
        [{ code: 1 }, expect.objectContaining({ unique: true })],
      ]),
    );
    expect(AirlineSchema.options.timestamps).toBe(true);
  });

  it('preserves profile normalization and defaults with USD baggage currency', async () => {
    const airline = new airlineModel({ name: ' EgyptAir ', code: 'ms' });
    await expect(airline.validate()).resolves.toBeUndefined();
    expect(airline.toObject()).toMatchObject({
      name: 'EgyptAir',
      code: 'MS',
      isActive: true,
      baggagePolicy: {
        extraBagPrice: 0,
        maxExtraBagsPerPassenger: 0,
        currency: PLATFORM_CURRENCY,
      },
      cancellationPolicy: { rules: [] },
    });
    expect(airline.baggagePolicy.currency).toBe('USD');
  });

  it.each(['EUR', 'EGP', null])(
    'rejects baggage currency %s',
    async (currency) => {
      const airline = new airlineModel({
        name: 'EgyptAir',
        code: 'MS',
        baggagePolicy: { currency },
      });
      await expect(airline.validate()).rejects.toHaveProperty([
        'errors',
        'baggagePolicy.currency',
      ]);
    },
  );

  it('preserves baggage and cancellation policy validators', async () => {
    const airline = new airlineModel({
      name: 'EgyptAir',
      code: 'MS',
      baggagePolicy: { extraBagPrice: -1, maxExtraBagsPerPassenger: -1 },
      cancellationPolicy: {
        rules: [{ daysBeforeDeparture: -1, refundPercent: 101 }],
      },
    });
    await expect(airline.validate()).rejects.toMatchObject({
      errors: {
        'baggagePolicy.extraBagPrice': expect.anything(),
        'baggagePolicy.maxExtraBagsPerPassenger': expect.anything(),
        'cancellationPolicy.rules.0.daysBeforeDeparture': expect.anything(),
        'cancellationPolicy.rules.0.refundPercent': expect.anything(),
      },
    });
  });
});
