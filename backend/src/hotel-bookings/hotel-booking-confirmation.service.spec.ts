import { Types } from 'mongoose';
import { BookingType } from '../payments/enums/payment.enums';
import { HotelBookingConfirmationService } from './hotel-booking-confirmation.service';
import { HotelBookingStatus } from './schemas/hotel-booking.schema';

const bookingId = new Types.ObjectId();

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    _id: bookingId,
    user: new Types.ObjectId(),
    hotel: new Types.ObjectId(),
    status: HotelBookingStatus.CONFIRMED,
    bookingReference: 'HTL-ABCD2345',
    checkIn: new Date('2026-12-01T00:00:00.000Z'),
    checkOut: new Date('2026-12-04T00:00:00.000Z'),
    rooms: [{ room: new Types.ObjectId(), adults: 2, children: 0 }],
    totalPrice: 300,
    currency: 'USD',
    ...overrides,
  };
}

function setup() {
  const bookingModel = { findOneAndUpdate: jest.fn() };
  const notificationsService = { create: jest.fn().mockResolvedValue(undefined) };
  const paymentsService = { onBookingConfirmed: jest.fn() };
  const service = new HotelBookingConfirmationService(
    bookingModel as never,
    notificationsService as never,
    paymentsService as never,
  );
  return { service, bookingModel, notificationsService, paymentsService };
}

describe('HotelBookingConfirmationService.finalizeConfirmed', () => {
  it('adds a reference to a confirmed reservation and notifies the user', async () => {
    const { service, bookingModel, notificationsService } = setup();
    const booking = makeBooking();
    bookingModel.findOneAndUpdate.mockResolvedValue(booking);

    const result = await service.finalizeConfirmed(bookingId.toString());

    expect(result).toBe(booking);
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(notificationsService.create).toHaveBeenCalledWith(
      booking.user,
      expect.objectContaining({
        metadata: expect.objectContaining({ bookingReference: 'HTL-ABCD2345' }),
      }),
    );
  });

  it('only matches a CONFIRMED reservation that has no reference yet', async () => {
    const { service, bookingModel } = setup();
    bookingModel.findOneAndUpdate.mockResolvedValue(makeBooking());

    await service.finalizeConfirmed(bookingId.toString());

    const [filter, update, options] = bookingModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: bookingId,
      status: HotelBookingStatus.CONFIRMED,
      bookingReference: { $exists: false },
    });
    expect(update.$set.bookingReference).toMatch(/^HTL-[A-HJ-NP-Z2-9]{8}$/);
    expect(options).toEqual({ returnDocument: 'after' });
  });

  it('does nothing and sends no notification when nothing matches (repeated webhook)', async () => {
    const { service, bookingModel, notificationsService } = setup();
    bookingModel.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.finalizeConfirmed(bookingId.toString());

    expect(result).toBeNull();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('returns null for an invalid id without touching the database', async () => {
    const { service, bookingModel } = setup();

    const result = await service.finalizeConfirmed('not-an-id');

    expect(result).toBeNull();
    expect(bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('tries another reference when the unique index reports a duplicate', async () => {
    const { service, bookingModel, notificationsService } = setup();
    bookingModel.findOneAndUpdate
      .mockRejectedValueOnce({ code: 11000 })
      .mockResolvedValueOnce(makeBooking());

    const result = await service.finalizeConfirmed(bookingId.toString());

    expect(result).not.toBeNull();
    expect(bookingModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
  });

  it('rethrows errors that are not duplicate keys', async () => {
    const { service, bookingModel } = setup();
    bookingModel.findOneAndUpdate.mockRejectedValue(new Error('db down'));

    await expect(service.finalizeConfirmed(bookingId.toString())).rejects.toThrow('db down');
  });

  it('keeps the confirmation when the notification fails', async () => {
    const { service, bookingModel, notificationsService } = setup();
    const booking = makeBooking();
    bookingModel.findOneAndUpdate.mockResolvedValue(booking);
    notificationsService.create.mockRejectedValue(new Error('notification failed'));

    await expect(service.finalizeConfirmed(bookingId.toString())).resolves.toBe(booking);
  });
});

describe('HotelBookingConfirmationService.onModuleInit', () => {
  it('registers a hook that finalizes hotel bookings only', async () => {
    const { service, paymentsService } = setup();
    const finalize = jest.spyOn(service, 'finalizeConfirmed').mockResolvedValue(null);

    service.onModuleInit();
    expect(paymentsService.onBookingConfirmed).toHaveBeenCalledTimes(1);
    const handler = paymentsService.onBookingConfirmed.mock.calls[0][0];

    await handler({ bookingType: BookingType.FLIGHT, bookingId: 'f1', paymentId: 'p1' });
    expect(finalize).not.toHaveBeenCalled();

    await handler({ bookingType: BookingType.HOTEL, bookingId: 'h1', paymentId: 'p2' });
    expect(finalize).toHaveBeenCalledWith('h1');
  });
});
