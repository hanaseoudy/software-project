import { Types } from 'mongoose';
import { FlightBookingConfirmationService } from './flight-booking-confirmation.service';

// The @nestjs/* packages are ES modules that jest cannot load here, and the
// service only needs them for decorators and types, so they are stubbed.
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Logger: class {
    error() {}
    log() {}
  },
}));
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_HOUR: '0 0-23/1 * * *' },
}));
jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
}));
jest.mock('../flights/schemas/flight.schema', () => ({
  Flight: { name: 'Flight' },
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));
jest.mock('../payments/payments.service', () => ({
  PaymentsService: class {},
}));
jest.mock('./schemas/flight-booking.schema', () => ({
  FlightBooking: { name: 'FlightBooking' },
  FlightBookingStatus: {
    CONFIRMED: 'CONFIRMED',
    PENDING_PAYMENT: 'PENDING_PAYMENT',
  },
}));
jest.mock('./schemas/passenger.schema', () => ({
  PassengerType: { ADULT: 'ADULT', CHILD: 'CHILD', INFANT: 'INFANT' },
}));
jest.mock('../notifications/enums/notification.enums', () => ({
  NotificationType: { BOOKING_CONFIRMED: 'BOOKING_CONFIRMED' },
}));
jest.mock('../payments/enums/payment.enums', () => ({
  BookingType: { FLIGHT: 'flight', HOTEL: 'hotel' },
}));

const bookingId = new Types.ObjectId();
const outbound = new Types.ObjectId();
const inbound = new Types.ObjectId();

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    _id: bookingId,
    user: new Types.ObjectId(),
    status: 'CONFIRMED',
    bookingReference: 'FLT-ABCD2345',
    tripType: 'ROUND_TRIP',
    cabinClass: 'ECONOMY',
    outboundFlight: outbound,
    returnFlight: inbound,
    passengers: [{ type: 'ADULT' }, { type: 'CHILD' }, { type: 'INFANT' }],
    totalPrice: 300,
    baggageFees: 20,
    currency: 'USD',
    ...overrides,
  };
}

function setup() {
  const bookingModel = {
    findOneAndUpdate: jest.fn(),
    updateOne: jest
      .fn()
      .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    find: jest.fn(),
  };
  const flightModel = {
    updateOne: jest
      .fn()
      .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
  };
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const paymentsService = { onBookingConfirmed: jest.fn() };
  const service = new FlightBookingConfirmationService(
    bookingModel as never,
    flightModel as never,
    notificationsService as never,
    paymentsService as never,
  );
  return {
    service,
    bookingModel,
    flightModel,
    notificationsService,
    paymentsService,
  };
}

describe('FlightBookingConfirmationService.finalizeConfirmed', () => {
  it('gives the booking a reference, converts held seats and notifies the user', async () => {
    const { service, bookingModel, flightModel, notificationsService } =
      setup();
    const booking = makeBooking();
    bookingModel.findOneAndUpdate.mockResolvedValue(booking);

    await expect(service.finalizeConfirmed(bookingId.toString())).resolves.toBe(
      booking,
    );

    // 2 seats (the infant has no seat) on each of the two flights
    expect(flightModel.updateOne).toHaveBeenCalledTimes(2);
    expect(flightModel.updateOne).toHaveBeenNthCalledWith(
      1,
      {
        _id: outbound,
        cabins: {
          $elemMatch: { cabinClass: 'ECONOMY', heldSeats: { $gte: 2 } },
        },
      },
      { $inc: { 'cabins.$[c].heldSeats': -2, 'cabins.$[c].bookedSeats': 2 } },
      {
        arrayFilters: [
          { 'c.cabinClass': 'ECONOMY', 'c.heldSeats': { $gte: 2 } },
        ],
      },
    );
    expect(flightModel.updateOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        _id: inbound,
        cabins: {
          $elemMatch: { cabinClass: 'ECONOMY', heldSeats: { $gte: 2 } },
        },
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(notificationsService.create).toHaveBeenCalledWith(
      booking.user,
      expect.objectContaining({
        type: 'BOOKING_CONFIRMED',
        metadata: expect.objectContaining({
          bookingReference: 'FLT-ABCD2345',
          totalPrice: 320,
        }),
      }),
    );
  });

  it('only matches a CONFIRMED booking that has no reference yet', async () => {
    const { service, bookingModel } = setup();
    bookingModel.findOneAndUpdate.mockResolvedValue(makeBooking());

    await service.finalizeConfirmed(bookingId.toString());

    const [filter, update, options] =
      bookingModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: bookingId,
      status: 'CONFIRMED',
      bookingReference: { $exists: false },
    });
    expect(update.$set.bookingReference).toMatch(/^FLT-[A-HJ-NP-Z2-9]{8}$/);
    expect(options).toEqual({ returnDocument: 'after' });
  });

  it('does nothing when nothing matches (repeated webhook)', async () => {
    const { service, bookingModel, flightModel, notificationsService } =
      setup();
    bookingModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      service.finalizeConfirmed(bookingId.toString()),
    ).resolves.toBeNull();
    expect(flightModel.updateOne).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('returns null for an invalid id without touching the database', async () => {
    const { service, bookingModel } = setup();
    await expect(service.finalizeConfirmed('nope')).resolves.toBeNull();
    expect(bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('tries another reference when the unique index reports a duplicate', async () => {
    const { service, bookingModel } = setup();
    bookingModel.findOneAndUpdate
      .mockRejectedValueOnce({ code: 11000 })
      .mockResolvedValueOnce(makeBooking());

    await expect(
      service.finalizeConfirmed(bookingId.toString()),
    ).resolves.toBeTruthy();
    expect(bookingModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('removes the reference and puts converted seats back when a later flight fails', async () => {
    const { service, bookingModel, flightModel, notificationsService } =
      setup();
    bookingModel.findOneAndUpdate.mockResolvedValue(makeBooking());
    flightModel.updateOne
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }) // outbound converted
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 1 }) // return fails
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }); // outbound put back

    await expect(
      service.finalizeConfirmed(bookingId.toString()),
    ).rejects.toThrow('could not convert 2 held seat(s)');

    expect(flightModel.updateOne).toHaveBeenNthCalledWith(
      3,
      {
        _id: outbound,
        cabins: {
          $elemMatch: { cabinClass: 'ECONOMY', bookedSeats: { $gte: 2 } },
        },
      },
      { $inc: { 'cabins.$[c].heldSeats': 2, 'cabins.$[c].bookedSeats': -2 } },
      expect.anything(),
    );
    expect(bookingModel.updateOne).toHaveBeenCalledWith(
      { _id: bookingId },
      { $unset: { bookingReference: 1 } },
    );
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('fails when no held seats match, even though Mongoose still changes updatedAt', async () => {
    const { service, bookingModel, flightModel, notificationsService } =
      setup();
    bookingModel.findOneAndUpdate.mockResolvedValue(makeBooking());
    // Nothing matched the $elemMatch filter, but modifiedCount is 1 (updatedAt).
    flightModel.updateOne.mockResolvedValue({
      matchedCount: 0,
      modifiedCount: 1,
    });

    await expect(
      service.finalizeConfirmed(bookingId.toString()),
    ).rejects.toThrow('could not convert 2 held seat(s)');
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('keeps the confirmation when the notification fails', async () => {
    const { service, bookingModel, notificationsService } = setup();
    const booking = makeBooking();
    bookingModel.findOneAndUpdate.mockResolvedValue(booking);
    notificationsService.create.mockRejectedValue(new Error('db down'));

    await expect(service.finalizeConfirmed(bookingId.toString())).resolves.toBe(
      booking,
    );
  });

  it('converts a one-way booking on its single flight only', async () => {
    const { service, bookingModel, flightModel } = setup();
    bookingModel.findOneAndUpdate.mockResolvedValue(
      makeBooking({ returnFlight: undefined, tripType: 'ONE_WAY' }),
    );
    await service.finalizeConfirmed(bookingId.toString());
    expect(flightModel.updateOne).toHaveBeenCalledTimes(1);
  });
});

describe('FlightBookingConfirmationService.onModuleInit', () => {
  it('registers a hook that finalizes flight bookings only', async () => {
    const { service, paymentsService } = setup();
    const finalize = jest
      .spyOn(service, 'finalizeConfirmed')
      .mockResolvedValue(null);
    service.onModuleInit();

    expect(paymentsService.onBookingConfirmed).toHaveBeenCalledTimes(1);
    const handler = paymentsService.onBookingConfirmed.mock.calls[0][0];

    await handler({
      bookingType: 'hotel',
      bookingId: 'h1',
      paymentId: 'p1',
      paidAt: new Date(),
    });
    expect(finalize).not.toHaveBeenCalled();

    await handler({
      bookingType: 'flight',
      bookingId: 'f1',
      paymentId: 'p2',
      paidAt: new Date(),
    });
    expect(finalize).toHaveBeenCalledWith('f1');
  });
});

describe('FlightBookingConfirmationService.finalizeMissedConfirmations', () => {
  function setupMissed(ids: Types.ObjectId[]) {
    const ctx = setup();
    ctx.bookingModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(ids.map((_id) => ({ _id }))),
    });
    return ctx;
  }

  it('looks only at CONFIRMED bookings without a reference', async () => {
    const { service, bookingModel } = setupMissed([]);
    await service.finalizeMissedConfirmations();
    expect(bookingModel.find).toHaveBeenCalledWith({
      status: 'CONFIRMED',
      bookingReference: { $exists: false },
    });
  });

  it('finalizes each missed booking, and keeps going when one fails', async () => {
    const { service, bookingModel } = setupMissed([
      new Types.ObjectId(),
      new Types.ObjectId(),
    ]);
    bookingModel.findOneAndUpdate
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(makeBooking());

    await expect(service.finalizeMissedConfirmations()).resolves.toBe(1);
  });
});
