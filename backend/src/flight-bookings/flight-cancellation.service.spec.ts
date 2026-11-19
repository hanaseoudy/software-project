import { Types } from 'mongoose';
import { FlightCancellationService } from './flight-cancellation.service';

// The @nestjs/* packages are ES modules that jest cannot load here, and the
// service only needs them for decorators, types and exceptions, so they are stubbed.
jest.mock('@nestjs/common', () => {
  class HttpError extends Error {}
  return {
    Injectable: () => () => undefined,
    Logger: class {
      error() {}
    },
    BadRequestException: class BadRequestException extends HttpError {},
    ConflictException: class ConflictException extends HttpError {},
    NotFoundException: class NotFoundException extends HttpError {},
  };
});
jest.mock('@nestjs/mongoose', () => ({ InjectModel: () => () => undefined }));
jest.mock('../airlines/schemas/airline.schema', () => ({
  Airline: { name: 'Airline' },
}));
jest.mock('../flights/schemas/flight.schema', () => ({
  Flight: { name: 'Flight' },
}));
jest.mock('../payments/schemas/payment.schema', () => ({
  Payment: { name: 'Payment' },
}));
jest.mock('../payments/refunds.service', () => ({
  RefundsService: class {},
  refundQuote: jest.fn(),
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));
jest.mock('../notifications/enums/notification.enums', () => ({
  NotificationType: { BOOKING_CANCELLED: 'BOOKING_CANCELLED' },
}));
jest.mock('../payments/enums/payment.enums', () => ({
  BookingType: { FLIGHT: 'flight' },
  PaymentStatus: { SUCCEEDED: 'succeeded' },
}));
jest.mock('./schemas/flight-booking.schema', () => ({
  FlightBooking: { name: 'FlightBooking' },
  FlightBookingStatus: {
    CONFIRMED: 'CONFIRMED',
    CANCELLED: 'CANCELLED',
    PENDING_PAYMENT: 'PENDING_PAYMENT',
  },
}));
jest.mock('./schemas/passenger.schema', () => ({
  PassengerType: { ADULT: 'ADULT', CHILD: 'CHILD', INFANT: 'INFANT' },
}));

import { refundQuote } from '../payments/refunds.service';

const now = new Date('2026-12-01T10:00:00Z');
const userId = new Types.ObjectId();
const bookingId = new Types.ObjectId();
const outbound = new Types.ObjectId();
const inbound = new Types.ObjectId();
const airlineId = new Types.ObjectId();
const rules = [{ daysBeforeDeparture: 3, refundPercent: 50 }];
const quote = {
  amount: 60,
  appliedPolicy: { refundPercent: 50, daysRemaining: 4 },
};

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    _id: bookingId,
    user: userId,
    status: 'CONFIRMED',
    bookingReference: 'FLT-ABCD2345',
    cabinClass: 'ECONOMY',
    outboundFlight: outbound,
    returnFlight: inbound,
    passengers: [{ type: 'ADULT' }, { type: 'CHILD' }, { type: 'INFANT' }],
    ...overrides,
  };
}

function setup(
  opts: { booking?: unknown; departure?: Date; payment?: unknown } = {},
) {
  const bookingModel = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.booking === undefined ? makeBooking() : opts.booking,
      ),
    findOneAndUpdate: jest.fn().mockResolvedValue({ _id: bookingId }),
  };
  const flightModel = {
    findById: jest.fn().mockResolvedValue({
      airline: airlineId,
      departureTime: opts.departure ?? new Date('2026-12-05T10:00:00Z'),
    }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const airlineModel = {
    findById: jest.fn().mockResolvedValue({ cancellationPolicy: { rules } }),
  };
  const paymentModel = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.payment === undefined
          ? { amount: 120, currency: 'USD' }
          : opts.payment,
      ),
  };
  const refundsService = {
    issueRefund: jest
      .fn()
      .mockResolvedValue({
        id: 'r1',
        amount: 60,
        currency: 'USD',
        status: 'pending',
      }),
  };
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  (refundQuote as jest.Mock).mockReturnValue(quote);
  const service = new FlightCancellationService(
    bookingModel as never,
    flightModel as never,
    airlineModel as never,
    paymentModel as never,
    refundsService as never,
    notificationsService as never,
  );
  return {
    service,
    bookingModel,
    flightModel,
    airlineModel,
    paymentModel,
    refundsService,
    notificationsService,
  };
}

describe('FlightCancellationService.getQuote', () => {
  it('computes the refund from the airline tiers and the days left', async () => {
    const { service } = setup();
    const result = await service.getQuote(
      userId.toString(),
      bookingId.toString(),
      now,
    );

    expect(refundQuote).toHaveBeenCalledWith({
      paidAmount: 120,
      daysRemaining: 4,
      flightTiers: rules,
    });
    expect(result).toMatchObject({
      paidAmount: 120,
      currency: 'USD',
      refundAmount: 60,
      refundPercent: 50,
    });
  });

  it('is blocked after departure', async () => {
    const { service } = setup({ departure: new Date('2026-12-01T09:00:00Z') });
    await expect(
      service.getQuote(userId.toString(), bookingId.toString(), now),
    ).rejects.toThrow('after departure');
  });

  it('only works for a CONFIRMED booking', async () => {
    const { service } = setup({
      booking: makeBooking({ status: 'PENDING_PAYMENT' }),
    });
    await expect(
      service.getQuote(userId.toString(), bookingId.toString(), now),
    ).rejects.toThrow('Only a confirmed booking can be cancelled');
  });

  it("does not find another user's booking", async () => {
    const { service, bookingModel } = setup({ booking: null });
    await expect(
      service.getQuote(userId.toString(), bookingId.toString(), now),
    ).rejects.toThrow('Booking not found');
    expect(bookingModel.findOne).toHaveBeenCalledWith({
      _id: bookingId,
      user: userId,
    });
  });

  it('rejects an invalid id', async () => {
    const { service } = setup();
    await expect(
      service.getQuote(userId.toString(), 'nope', now),
    ).rejects.toThrow('Invalid booking ID');
  });
});

describe('FlightCancellationService.cancel', () => {
  const run = (service: FlightCancellationService, confirm = true) =>
    service.cancel(userId.toString(), bookingId.toString(), { confirm }, now);

  it('cancels, returns the booked seats on both flights and creates the refund', async () => {
    const {
      service,
      bookingModel,
      flightModel,
      refundsService,
      notificationsService,
    } = setup();
    const result = await run(service);

    expect(bookingModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: bookingId, user: userId, status: 'CONFIRMED' },
      {
        $set: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: 'Cancelled by the user',
        },
      },
      { returnDocument: 'after' },
    );
    // 2 seats (the infant has none) back on each of the 2 flights
    expect(flightModel.updateOne).toHaveBeenCalledTimes(2);
    expect(flightModel.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: outbound },
      { $inc: { 'cabins.$[c].bookedSeats': -2 } },
      {
        arrayFilters: [
          { 'c.cabinClass': 'ECONOMY', 'c.bookedSeats': { $gte: 2 } },
        ],
      },
    );
    expect(refundsService.issueRefund).toHaveBeenCalledWith({
      bookingType: 'flight',
      bookingId: bookingId.toString(),
      amount: 60,
      appliedPolicy: quote.appliedPolicy,
      reason: 'Flight booking cancelled by the user',
    });
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'CANCELLED',
      refundAmount: 60,
      refund: { id: 'r1', amount: 60, currency: 'USD', status: 'pending' },
    });
    expect(result).not.toHaveProperty('warning');
  });

  it('returns held seats when the booking has no reference yet (seats were not converted)', async () => {
    const { service, flightModel } = setup({
      booking: makeBooking({
        bookingReference: undefined,
        returnFlight: undefined,
      }),
    });
    await run(service);
    expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
    expect(flightModel.updateOne).toHaveBeenCalledWith(
      { _id: outbound },
      { $inc: { 'cabins.$[c].heldSeats': -2 } },
      expect.anything(),
    );
  });

  it('needs the confirmation', async () => {
    const { service, bookingModel } = setup();
    await expect(run(service, false)).rejects.toThrow('confirm must be true');
    expect(bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('is blocked after departure and changes nothing', async () => {
    const { service, bookingModel, flightModel, refundsService } = setup({
      departure: new Date('2026-12-01T10:00:00Z'),
    });
    await expect(run(service)).rejects.toThrow('after departure');
    expect(bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(flightModel.updateOne).not.toHaveBeenCalled();
    expect(refundsService.issueRefund).not.toHaveBeenCalled();
  });

  it('does nothing twice when another request cancelled it at the same moment', async () => {
    const { service, bookingModel, flightModel, refundsService } = setup();
    bookingModel.findOneAndUpdate.mockResolvedValue(null);
    await expect(run(service)).rejects.toThrow(
      'Only a confirmed booking can be cancelled',
    );
    expect(flightModel.updateOne).not.toHaveBeenCalled();
    expect(refundsService.issueRefund).not.toHaveBeenCalled();
  });

  it('a 0% tier cancels without a refund and without a warning', async () => {
    const { service, refundsService } = setup();
    (refundQuote as jest.Mock).mockReturnValue({
      amount: 0,
      appliedPolicy: { refundPercent: 0 },
    });
    refundsService.issueRefund.mockResolvedValue(null);
    const result = await run(service);
    expect(result).toMatchObject({
      status: 'CANCELLED',
      refund: null,
      refundAmount: 0,
    });
    expect(result).not.toHaveProperty('warning');
  });

  it('keeps the cancellation and warns when the refund cannot be created', async () => {
    const { service, refundsService } = setup();
    refundsService.issueRefund.mockRejectedValue(
      new Error('Stripe is not configured'),
    );
    const result = await run(service);
    expect(result).toMatchObject({ status: 'CANCELLED', refund: null });
    expect(result).toHaveProperty('warning');
  });

  it('keeps the cancellation when the notification fails', async () => {
    const { service, notificationsService } = setup();
    notificationsService.create.mockRejectedValue(new Error('db down'));
    await expect(run(service)).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('needs a successful payment', async () => {
    const { service } = setup({ payment: null });
    await expect(run(service)).rejects.toThrow('No successful payment');
  });
});
