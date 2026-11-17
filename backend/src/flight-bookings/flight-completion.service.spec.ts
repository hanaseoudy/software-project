jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Logger: class {
    log() {}
  },
}));
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_HOUR: '0 0-23/1 * * *' },
}));
jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => () => undefined,
  SchemaFactory: { createForClass: () => ({ index: () => undefined }) },
}));
jest.mock('../flights/schemas/flight.schema', () => ({
  Flight: { name: 'Flight' },
}));
jest.mock('./schemas/flight-booking.schema', () => ({
  FlightBooking: { name: 'FlightBooking' },
  FlightBookingStatus: { CONFIRMED: 'CONFIRMED', COMPLETED: 'COMPLETED' },
}));

import { FlightCompletionService } from './flight-completion.service';

describe('FlightCompletionService', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const flightModel = { collection: { name: 'flights' } };

  function build(aggregated: Array<{ _id: string }>, modifiedCount = 0) {
    const bookingModel = {
      aggregate: jest.fn().mockResolvedValue(aggregated),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount }),
    };
    const service = new FlightCompletionService(
      bookingModel as never,
      flightModel as never,
    );
    return { service, bookingModel };
  }

  it('only looks at CONFIRMED bookings and uses the return flight when there is one', async () => {
    const { service, bookingModel } = build([]);
    await service.completeArrivedBookings(now);

    const pipeline = bookingModel.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { status: 'CONFIRMED' } });
    expect(pipeline[1]).toEqual({
      $addFields: {
        lastFlightId: { $ifNull: ['$returnFlight', '$outboundFlight'] },
      },
    });
    expect(pipeline[2].$lookup.from).toBe('flights');
    expect(pipeline[3]).toEqual({
      $match: { 'lastFlight.arrivalTime': { $lte: now } },
    });
  });

  it('completes the arrived bookings and re-checks CONFIRMED in the update', async () => {
    const { service, bookingModel } = build([{ _id: 'a' }, { _id: 'b' }], 2);

    await expect(service.completeArrivedBookings(now)).resolves.toBe(2);
    expect(bookingModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['a', 'b'] }, status: 'CONFIRMED' },
      { $set: { status: 'COMPLETED' } },
    );
  });

  it('does not update anything when no booking has arrived', async () => {
    const { service, bookingModel } = build([]);
    await expect(service.completeArrivedBookings(now)).resolves.toBe(0);
    expect(bookingModel.updateMany).not.toHaveBeenCalled();
  });
});
