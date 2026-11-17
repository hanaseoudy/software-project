import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { BookingType } from '../payments/enums/payment.enums';
import { RefundsService } from '../payments/refunds.service';
import { HotelCancellationService } from './hotel-cancellation.service';
import { HotelBooking } from './schemas/hotel-booking.schema';

const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
const leanResult = <T>(value: T) => ({ lean: () => execResult(value) });
const selectLean = <T>(value: T) => ({ select: () => leanResult(value) });

const NOW = new Date('2026-12-10T15:00:00.000Z');
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('HotelCancellationService (HTL-21)', () => {
  let service: HotelCancellationService;
  const bookingModel = { findOne: jest.fn(), updateOne: jest.fn() };
  const hotelModel = { findById: jest.fn() };
  const refunds = { issueRefund: jest.fn() };

  const userId = new Types.ObjectId();
  const hotelId = new Types.ObjectId();
  // 14+ days before check-in: 100%, 7+ days: 50%, 2+ days: 20%, otherwise nothing
  const tiers = [
    { daysBeforeCheckIn: 14, refundPercentage: 100 },
    { daysBeforeCheckIn: 7, refundPercentage: 50 },
    { daysBeforeCheckIn: 2, refundPercentage: 20 },
  ];
  const booking = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    bookingReference: 'HTL-AAAAAA',
    user: userId,
    hotel: hotelId,
    checkIn: day('2026-12-20'), // 10 days after NOW
    checkOut: day('2026-12-23'),
    totalPrice: 660,
    currency: 'USD',
    status: 'CONFIRMED',
    ...over,
  });
  const setup = (b: unknown, hotelTiers = tiers) => {
    bookingModel.findOne.mockReturnValue(leanResult(b));
    bookingModel.updateOne.mockReturnValue(execResult({ modifiedCount: 1 }));
    hotelModel.findById.mockReturnValue(selectLean({ policies: { cancellationTiers: hotelTiers } }));
    refunds.issueRefund.mockResolvedValue({ id: 'refund1', amount: 330, status: 'pending' });
  };
  const id = () => new Types.ObjectId().toString();

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelCancellationService,
        { provide: getModelToken(HotelBooking.name), useValue: bookingModel },
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: RefundsService, useValue: refunds },
      ],
    }).compile();
    service = moduleRef.get(HotelCancellationService);
  });

  describe('quote', () => {
    it("computes the refund from the hotel's tiers on the full total", async () => {
      setup(booking());
      expect(await service.quote(userId.toString(), id(), NOW)).toEqual({
        reservationId: expect.any(String),
        bookingReference: 'HTL-AAAAAA',
        checkIn: '2026-12-20',
        totalPrice: 660,
        currency: 'USD',
        daysBeforeCheckIn: 10,
        appliedTier: { daysBeforeCheckIn: 7, refundPercentage: 50 },
        refundPercentage: 50,
        refundAmount: 330,
      });
    });

    it.each([
      ['2027-01-30', 100, 660, 14], // 51 days before: the highest tier applies
      ['2026-12-24', 100, 660, 14], // exactly 14 days before: the 14-day tier
      ['2026-12-23', 50, 330, 7], // 13 days
      ['2026-12-17', 50, 330, 7], // exactly 7 days
      ['2026-12-16', 20, 132, 2], // 6 days
      ['2026-12-12', 20, 132, 2], // exactly 2 days
    ])('check-in %s refunds %s%%', async (checkIn, percent, amount, tierDays) => {
      setup(booking({ checkIn: day(checkIn), checkOut: day('2027-02-10') }));
      const quote = await service.quote(userId.toString(), id(), NOW);
      expect(quote.refundPercentage).toBe(percent);
      expect(quote.refundAmount).toBe(amount);
      expect(quote.appliedTier?.daysBeforeCheckIn).toBe(tierDays);
    });

    it('refunds nothing when no tier applies (1 day before check-in)', async () => {
      setup(booking({ checkIn: day('2026-12-11'), checkOut: day('2026-12-13') }));
      const quote = await service.quote(userId.toString(), id(), NOW);
      expect(quote).toMatchObject({ daysBeforeCheckIn: 1, appliedTier: null, refundPercentage: 0, refundAmount: 0 });
    });

    it('refunds nothing when the hotel has no tiers', async () => {
      setup(booking(), []);
      expect((await service.quote(userId.toString(), id(), NOW)).refundAmount).toBe(0);
    });

    it('rounds the refund to cents', async () => {
      setup(booking({ totalPrice: 99.99 }));
      expect((await service.quote(userId.toString(), id(), NOW)).refundAmount).toBe(50);
    });

    it('returns 404 for another guest\'s reservation, an unknown one or an invalid id', async () => {
      setup(null);
      await expect(service.quote(userId.toString(), id(), NOW)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.quote(userId.toString(), 'abc', NOW)).rejects.toBeInstanceOf(NotFoundException);
      const filter = bookingModel.findOne.mock.calls[0][0];
      expect(filter.user).toEqual(userId); // looked up by owner too
    });

    it.each(['PENDING_PAYMENT', 'EXPIRED', 'COMPLETED'])('refuses a %s reservation with 409', async (status) => {
      setup(booking({ status }));
      await expect(service.quote(userId.toString(), id(), NOW)).rejects.toThrow('Only a Confirmed reservation can be cancelled');
    });

    it('says when the reservation is already cancelled', async () => {
      setup(booking({ status: 'CANCELLED' }));
      await expect(service.quote(userId.toString(), id(), NOW)).rejects.toThrow('already cancelled');
    });

    it('refuses on the check-in date and after it', async () => {
      setup(booking({ checkIn: day('2026-12-10') }));
      await expect(service.quote(userId.toString(), id(), NOW)).rejects.toThrow('before its check-in date');
      setup(booking({ checkIn: day('2026-12-01') }));
      await expect(service.quote(userId.toString(), id(), NOW)).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows the day before check-in', async () => {
      setup(booking({ checkIn: day('2026-12-11'), checkOut: day('2026-12-12') }));
      await expect(service.quote(userId.toString(), id(), NOW)).resolves.toMatchObject({ daysBeforeCheckIn: 1 });
    });
  });

  describe('cancel', () => {
    it('cancels the whole reservation and creates the PAY-03 refund', async () => {
      const b = booking();
      setup(b);
      const result = await service.cancel(userId.toString(), b._id.toString(), { expectedRefundAmount: 330 }, NOW);

      const [filter, update] = bookingModel.updateOne.mock.calls[0];
      expect(filter).toMatchObject({ _id: b._id, user: userId, status: 'CONFIRMED' });
      expect(filter.checkIn.$gte).toEqual(new Date('2026-12-11T00:00:00.000Z')); // check-in must be tomorrow or later
      expect(update).toEqual({ $set: { status: 'CANCELLED' } });

      expect(refunds.issueRefund).toHaveBeenCalledWith({
        bookingType: BookingType.HOTEL,
        bookingId: b._id,
        amount: 330,
        appliedPolicy: expect.objectContaining({ refundPercent: 50, daysBeforeCheckIn: 7, daysRemaining: 10 }),
        reason: expect.stringContaining('HTL-AAAAAA'),
      });
      expect(result).toEqual({
        id: b._id.toString(),
        bookingReference: 'HTL-AAAAAA',
        status: 'CANCELLED',
        refundAmount: 330,
        currency: 'USD',
        refund: { id: 'refund1', amount: 330, status: 'pending' },
        refundError: null,
      });
    });

    it('cancels before issuing the refund (a refund needs a cancelled booking)', async () => {
      const b = booking();
      setup(b);
      const order: string[] = [];
      bookingModel.updateOne.mockImplementation(() => {
        order.push('cancel');
        return execResult({ modifiedCount: 1 });
      });
      refunds.issueRefund.mockImplementation(async () => {
        order.push('refund');
        return null;
      });
      await service.cancel(userId.toString(), b._id.toString(), { expectedRefundAmount: 330 }, NOW);
      expect(order).toEqual(['cancel', 'refund']);
    });

    it('refuses with 409 and cancels nothing when the refund is not the one the guest saw', async () => {
      const b = booking();
      setup(b);
      const error = await service
        .cancel(userId.toString(), b._id.toString(), { expectedRefundAmount: 660 }, NOW)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain('330.00 USD');
      expect(bookingModel.updateOne).not.toHaveBeenCalled();
      expect(refunds.issueRefund).not.toHaveBeenCalled();
    });

    it('a 0% refund still cancels the reservation, and no refund is created (PAY-03 returns null)', async () => {
      const b = booking({ checkIn: day('2026-12-11'), checkOut: day('2026-12-12') });
      setup(b);
      refunds.issueRefund.mockResolvedValue(null);
      const result = await service.cancel(userId.toString(), b._id.toString(), { expectedRefundAmount: 0 }, NOW);
      expect(bookingModel.updateOne).toHaveBeenCalled();
      expect(refunds.issueRefund).toHaveBeenCalledWith(expect.objectContaining({ amount: 0 }));
      expect(result).toMatchObject({ status: 'CANCELLED', refundAmount: 0, refund: null, refundError: null });
    });

    it('returns 409 when the reservation was cancelled or completed in the meantime (atomic update matches nothing)', async () => {
      const b = booking();
      setup(b);
      bookingModel.updateOne.mockReturnValue(execResult({ modifiedCount: 0 }));
      await expect(
        service.cancel(userId.toString(), b._id.toString(), { expectedRefundAmount: 330 }, NOW),
      ).rejects.toThrow('can no longer be cancelled');
      expect(refunds.issueRefund).not.toHaveBeenCalled();
    });

    it('keeps the reservation cancelled and reports it when the refund could not be started', async () => {
      const b = booking();
      setup(b);
      refunds.issueRefund.mockRejectedValue(new Error('Stripe is not configured'));
      const result = await service.cancel(userId.toString(), b._id.toString(), { expectedRefundAmount: 330 }, NOW);
      expect(result.status).toBe('CANCELLED');
      expect(result.refund).toBeNull();
      expect(result.refundError).toContain('refund could not be started');
    });

    it.each(['PENDING_PAYMENT', 'COMPLETED', 'CANCELLED'])('refuses a %s reservation without changing anything', async (status) => {
      setup(booking({ status }));
      await expect(
        service.cancel(userId.toString(), id(), { expectedRefundAmount: 0 }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(bookingModel.updateOne).not.toHaveBeenCalled();
    });

    it('returns 404 for another guest\'s reservation', async () => {
      setup(null);
      await expect(
        service.cancel(userId.toString(), id(), { expectedRefundAmount: 0 }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(bookingModel.updateOne).not.toHaveBeenCalled();
    });
  });
});
