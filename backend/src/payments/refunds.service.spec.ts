import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationType } from '../notifications/enums/notification.enums';
import { BookingType, PaymentStatus, RefundStatus } from './enums/payment.enums';
import { RefundsService } from './refunds.service';

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
      : makeDoc({ userId, amount: 200, currency: 'USD', status: PaymentStatus.SUCCEEDED, stripePaymentIntentId: 'pi_1' });
  let created: any;
  const refundModel = {
    exists: jest.fn().mockResolvedValue(options.existingRefund ? { _id: 'r' } : null),
    create: jest.fn().mockImplementation(async (data: Record<string, unknown>) => (created = makeDoc(data))),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn().mockImplementation(async () => ({ ok: true })),
  };
  const paymentModel = {
    findOne: jest.fn().mockResolvedValue(payment),
    findById: jest.fn().mockResolvedValue(payment),
  };
  const bookingExists = jest.fn().mockResolvedValue(options.cancelled === false ? null : { _id: bookingId });
  const flightModel = { exists: bookingExists, updateOne: jest.fn().mockResolvedValue({}) };
  const hotelModel = { exists: bookingExists };
  const stripe = {
    refunds: {
      create: options.stripeThrows
        ? jest.fn().mockRejectedValue(new Error('charge already refunded'))
        : jest.fn().mockResolvedValue({ id: 're_1', status: options.stripeStatus ?? 'pending' }),
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
  return { service, refundModel, paymentModel, flightModel, stripe, notifications, payment, getCreated: () => created };
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
