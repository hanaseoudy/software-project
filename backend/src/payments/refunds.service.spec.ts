import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationType } from '../notifications/enums/notification.enums';
import { BookingType, PaymentStatus, RefundStatus } from './enums/payment.enums';
import { RefundsService, refundQuote } from './refunds.service';

const userId = new Types.ObjectId();
const bookingId = new Types.ObjectId();

function makeDoc(fields: Record<string, unknown>) {
  const doc: any = { _id: new Types.ObjectId(), ...fields };
  doc.id = doc._id.toString();
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
}

function setup(options: { cancelled?: boolean; payment?: any; existingRefund?: boolean; stripeStatus?: string; stripeThrows?: boolean } = {}) {
  const payment =
    'payment' in options
      ? options.payment
      : makeDoc({ userId, bookingType: BookingType.FLIGHT, bookingId, amount: 200, currency: 'USD', status: PaymentStatus.SUCCEEDED, stripePaymentIntentId: 'pi_1' });
  let created: any;
  const refundModel = {
    exists: jest.fn().mockResolvedValue(options.existingRefund ? { _id: 'r' } : null),
    create: jest.fn().mockImplementation(async (data: Record<string, unknown>) => (created = makeDoc(data))),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn().mockImplementation(async () => ({ ok: true })),
    find: jest.fn().mockResolvedValue([]),
  };
  // Simulates MongoDB's atomic findOneAndUpdate on the refundInProgress flag: only one caller wins.
  let refundInProgress = !!options.existingRefund;
  const paymentModel = {
    findOne: jest.fn().mockResolvedValue(payment),
    findById: jest.fn().mockResolvedValue(payment),
    findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
      if (filter.refundInProgress?.$ne === true && refundInProgress) return null;
      refundInProgress = update.$set.refundInProgress;
      return payment;
    }),
    updateOne: jest.fn(async (_filter: any, update: any) => {
      refundInProgress = update.$set.refundInProgress;
      return { modifiedCount: 1 };
    }),
  };
  const bookingExists = jest.fn().mockResolvedValue(options.cancelled === false ? null : { _id: bookingId });
  const flightModel = { exists: bookingExists, updateOne: jest.fn().mockResolvedValue({}) };
  const hotelModel = { exists: bookingExists };
  const stripe = {
    refunds: {
      create: options.stripeThrows
        ? jest.fn().mockRejectedValue(new Error('charge already refunded'))
        : jest.fn().mockResolvedValue({ id: 're_1', status: options.stripeStatus ?? 'pending' }),
      retrieve: jest.fn(),
    },
  };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const service = new RefundsService(
    refundModel as any,
    paymentModel as any,
    flightModel as any,
    hotelModel as any,
    stripe as any,
    notifications as any,
  );
  return {
    service, refundModel, paymentModel, flightModel, stripe, notifications, payment,
    getCreated: () => created,
    isClaimed: () => refundInProgress,
  };
}

const input = { bookingType: BookingType.FLIGHT, bookingId, amount: 100, appliedPolicy: { daysBeforeDeparture: 7, refundPercent: 50 }, reason: 'Cancelled by user' };

describe('RefundsService (PAY-03)', () => {
  describe('issueRefund', () => {
    it('issues a Stripe refund, records it as Pending and links it to the flight booking', async () => {
      const { service, stripe, refundModel, flightModel, notifications } = setup();
      const result = await service.issueRefund(input);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_1', amount: 10000 }),
      );
      expect(refundModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100, currency: 'USD', status: RefundStatus.PENDING, appliedPolicy: input.appliedPolicy }),
      );
      expect(flightModel.updateOne).toHaveBeenCalled();
      expect(result?.status).toBe(RefundStatus.PENDING);
      expect(notifications.create).not.toHaveBeenCalled(); // only on the final result
    });

    it('issues no refund for a 0 amount', async () => {
      const { service, stripe } = setup();
      expect(await service.issueRefund({ ...input, amount: 0 })).toBeNull();
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('rejects a negative amount', async () => {
      const { service } = setup();
      await expect(service.issueRefund({ ...input, amount: -5 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an amount above what was paid', async () => {
      const { service } = setup();
      await expect(service.issueRefund({ ...input, amount: 250 })).rejects.toThrow(/more than the amount paid/);
    });

    it('rejects a booking that is not cancelled', async () => {
      const { service } = setup({ cancelled: false });
      await expect(service.issueRefund(input)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a booking without a successful payment', async () => {
      const { service } = setup({ payment: null });
      await expect(service.issueRefund(input)).rejects.toThrow(/No successful payment/);
    });

    it('rejects a second refund for the same booking', async () => {
      const { service } = setup({ existingRefund: true });
      await expect(service.issueRefund(input)).rejects.toThrow(/already has a refund/);
    });

    it('refunds only once when two requests arrive at the same moment (double click)', async () => {
      const { service, stripe } = setup();
      const results = await Promise.allSettled([service.issueRefund(input), service.issueRefund(input)]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    });

    it('keeps the claim after a refund, so the booking cannot be refunded again', async () => {
      const { service, isClaimed } = setup({ stripeStatus: 'succeeded' });
      await service.issueRefund(input);
      expect(isClaimed()).toBe(true);
      await expect(service.issueRefund(input)).rejects.toThrow(/already has a refund/);
    });

    it('releases the claim if the refund record cannot be saved, so it can be retried', async () => {
      const { service, refundModel, stripe, isClaimed } = setup();
      refundModel.create.mockRejectedValueOnce(new Error('database unavailable'));

      await expect(service.issueRefund(input)).rejects.toThrow('database unavailable');
      expect(isClaimed()).toBe(false);
      expect(stripe.refunds.create).not.toHaveBeenCalled();

      await expect(service.issueRefund(input)).resolves.toEqual(expect.objectContaining({ amount: 100 }));
    });

    it('releases the claim when the refund fails, so it can be retried', async () => {
      const { service, stripe, isClaimed } = setup({ stripeThrows: true });
      await service.issueRefund(input);
      expect(isClaimed()).toBe(false);

      stripe.refunds.create.mockResolvedValue({ id: 're_2', status: 'succeeded' });
      const retry = await service.issueRefund(input);
      expect(retry?.status).toBe(RefundStatus.REFUNDED);
    });

    it('finishes at once when Stripe succeeds immediately and notifies the user', async () => {
      const { service, notifications, payment } = setup({ stripeStatus: 'succeeded' });
      const result = await service.issueRefund(input);

      expect(result?.status).toBe(RefundStatus.REFUNDED);
      expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(notifications.create).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ type: NotificationType.REFUND_PROCESSED, title: 'Refund completed' }),
      );
    });

    it('marks the payment fully refunded for a 100% refund', async () => {
      const { service, payment } = setup({ stripeStatus: 'succeeded' });
      await service.issueRefund({ ...input, amount: 200 });
      expect(payment.status).toBe(PaymentStatus.REFUNDED);
    });

    it('marks the refund Failed and notifies when Stripe rejects it', async () => {
      const { service, notifications } = setup({ stripeThrows: true });
      const result = await service.issueRefund(input);
      expect(result?.status).toBe(RefundStatus.FAILED);
      expect(notifications.create).toHaveBeenCalledWith(userId, expect.objectContaining({ title: 'Refund failed' }));
    });
  });

  describe('issueFareDifferenceRefund (FLT-27)', () => {
    it('refunds the lower fare of a Confirmed booking and keeps the payment Succeeded', async () => {
      const { service, stripe, refundModel, getCreated, payment, isClaimed } = setup({
        cancelled: false, // the booking stays Confirmed
        stripeStatus: 'succeeded',
      });
      refundModel.findOneAndUpdate.mockImplementation(async () => getCreated());

      const result = await service.issueFareDifferenceRefund({ bookingId, amount: 40, reason: 'cheaper flight' });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_1', amount: 4000 }),
      );
      expect(result).toMatchObject({ amount: 40, status: RefundStatus.REFUNDED });
      expect(getCreated().appliedPolicy).toMatchObject({ kind: 'fare-difference' });
      // a later cancellation (FLT-26) must still find a Succeeded, unclaimed payment
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(isClaimed()).toBe(false);
    });

    it('issues nothing for 0', async () => {
      const { service, stripe } = setup();
      await expect(service.issueFareDifferenceRefund({ bookingId, amount: 0 })).resolves.toBeNull();
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('cannot refund more than was paid', async () => {
      const { service } = setup({ cancelled: false });
      await expect(service.issueFareDifferenceRefund({ bookingId, amount: 500 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('needs a successful payment', async () => {
      const { service } = setup({ cancelled: false, payment: null });
      await expect(service.issueFareDifferenceRefund({ bookingId, amount: 10 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('refundUnconfirmedPayment', () => {
    it('returns the full amount of a payment whose booking was not confirmed, even though it is not cancelled', async () => {
      const { service, stripe, refundModel, payment } = setup({ cancelled: false });
      await service.refundUnconfirmedPayment(payment, 200, 'Paid after the booking hold ended');
      expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 20000 }));
      expect(refundModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 200, reason: 'Paid after the booking hold ended' }),
      );
    });

    it('does nothing if a refund already exists', async () => {
      const { service, stripe, payment } = setup({ existingRefund: true });
      await service.refundUnconfirmedPayment(payment, 200, 'x');
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('refunds only once when Stripe sends the same webhook twice at the same moment', async () => {
      const { service, stripe, payment } = setup({ cancelled: false });
      await Promise.all([
        service.refundUnconfirmedPayment(payment, 200, 'Booking not confirmed: hold ended'),
        service.refundUnconfirmedPayment(payment, 200, 'Booking not confirmed: hold ended'),
      ]);
      expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncPendingRefunds', () => {
    it('asks Stripe about old Pending refunds so none stays Pending forever', async () => {
      const { service, refundModel, stripe, notifications } = setup();
      const refund = makeDoc({ userId, paymentId: new Types.ObjectId(), bookingType: BookingType.HOTEL, bookingId, amount: 50, currency: 'USD', status: RefundStatus.PENDING, stripeRefundId: 're_9' });
      refundModel.find.mockResolvedValue([refund]);
      stripe.refunds.retrieve.mockResolvedValue({ id: 're_9', status: 'succeeded' });

      expect(await service.syncPendingRefunds()).toBe(1);
      expect(refund.status).toBe(RefundStatus.REFUNDED);
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleStripeRefund (webhook)', () => {
    it('moves a Pending refund to Refunded once', async () => {
      const { service, refundModel, notifications } = setup();
      const refund = makeDoc({ userId, paymentId: new Types.ObjectId(), bookingType: BookingType.HOTEL, bookingId, amount: 50, currency: 'USD', status: RefundStatus.PENDING });
      refundModel.findOne.mockResolvedValue(refund);

      await service.handleStripeRefund({ id: 're_1', status: 'succeeded' } as any);
      expect(refund.status).toBe(RefundStatus.REFUNDED);
      expect(notifications.create).toHaveBeenCalledTimes(1);

      // A repeated event finds it already final and does nothing.
      refundModel.findOneAndUpdate.mockResolvedValue(null);
      await service.handleStripeRefund({ id: 're_1', status: 'succeeded' } as any);
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('keeps Pending while Stripe is still pending', async () => {
      const { service, refundModel, notifications } = setup();
      const refund = makeDoc({ status: RefundStatus.PENDING });
      refundModel.findOne.mockResolvedValue(refund);
      await service.handleStripeRefund({ id: 're_1', status: 'pending' } as any);
      expect(refundModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it("hides another user's refund as not found", async () => {
      const { service, refundModel } = setup();
      refundModel.findById.mockResolvedValue(makeDoc({ userId: new Types.ObjectId() }));
      await expect(service.findOne(userId.toString(), new Types.ObjectId().toString())).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('refundQuote (PAY-03 amount follows the booking policy, project description 6.4)', () => {
  const airlineTiers = [
    { daysBeforeDeparture: 14, refundPercent: 100 },
    { daysBeforeDeparture: 7, refundPercent: 50 },
    { daysBeforeDeparture: 1, refundPercent: 20 },
  ];
  const hotelTiers = [
    { daysBeforeCheckIn: 14, refundPercentage: 100 },
    { daysBeforeCheckIn: 7, refundPercentage: 50 },
    { daysBeforeCheckIn: 0, refundPercentage: 0 },
  ];

  it('uses the FLT-09 airline tier that applies and records it', () => {
    expect(refundQuote({ paidAmount: 249.99, daysRemaining: 9, flightTiers: airlineTiers })).toEqual({
      amount: 125,
      appliedPolicy: {
        source: 'FLT-09 airline cancellation tiers',
        daysRemaining: 9,
        daysBeforeDeparture: 7,
        refundPercent: 50,
      },
    });
  });

  it('uses the HTL-10 hotel tier that applies and records it', () => {
    expect(refundQuote({ paidAmount: 400, daysRemaining: 20, hotelTiers })).toEqual({
      amount: 400,
      appliedPolicy: {
        source: 'HTL-10 hotel cancellation tiers',
        daysRemaining: 20,
        daysBeforeCheckIn: 14,
        refundPercent: 100,
      },
    });
  });

  it('gives 0 (no refund) when no tier applies', () => {
    expect(refundQuote({ paidAmount: 100, daysRemaining: 0, flightTiers: airlineTiers }).amount).toBe(0);
    expect(refundQuote({ paidAmount: 100, daysRemaining: 3, hotelTiers }).amount).toBe(0);
  });

  it('refunds 100% for a provider-initiated cancellation (e.g. FLT-06)', () => {
    expect(refundQuote({ paidAmount: 249.99, providerInitiated: true })).toEqual({
      amount: 249.99,
      appliedPolicy: { refundPercent: 100, rule: 'provider-initiated cancellation' },
    });
  });

  it('rounds to cents and never uses partial days', () => {
    expect(refundQuote({ paidAmount: 99.99, daysRemaining: 7.9, flightTiers: airlineTiers }).amount).toBe(50);
  });
});
