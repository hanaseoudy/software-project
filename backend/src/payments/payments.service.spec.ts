import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingType, PaymentStatus } from './enums/payment.enums';
import { buildBookingSummary } from '../flight-bookings/utils/booking-summary';
import { bookingAmount, PaymentsService } from './payments.service';

const userId = new Types.ObjectId().toString();
const bookingId = new Types.ObjectId();

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    _id: bookingId,
    user: new Types.ObjectId(userId),
    status: 'PENDING_PAYMENT',
    totalPrice: 100.5,
    baggageFees: 20,
    holdExpiresAt: new Date(Date.now() + 5 * 60_000),
    ...overrides,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  const payment: any = {
    _id: new Types.ObjectId(),
    id: 'pay1',
    userId: new Types.ObjectId(userId),
    bookingType: BookingType.FLIGHT,
    bookingId,
    amount: 120.5,
    currency: 'USD',
    status: PaymentStatus.PENDING,
    stripePaymentIntentId: 'pi_1',
    ...overrides,
  };
  payment.save = jest.fn().mockResolvedValue(payment);
  return payment;
}

/**
 * findById() mock: a plain .lean() returns the booking; .select().populate().lean()
 * (the ACC-15 provider check) returns the booking with its provider populated.
 */
function findByIdMock(booking: unknown, withProvider: unknown) {
  return jest.fn(() => {
    let populated = false;
    const query: any = {
      select: () => query,
      populate: () => {
        populated = true;
        return query;
      },
      lean: () => Promise.resolve(populated ? withProvider : booking),
    };
    return query;
  });
}

function setup(
  options: {
    booking?: unknown;
    stripe?: boolean;
    webhookSecret?: string;
    airlineActive?: boolean;
    returnAirlineActive?: boolean;
    hotelActive?: boolean;
  } = {},
) {
  const booking = 'booking' in options ? options.booking : makeBooking();
  const flightWithProvider = {
    outboundFlight: { airline: { isActive: options.airlineActive ?? true } },
    ...('returnAirlineActive' in options ? { returnFlight: { airline: { isActive: options.returnAirlineActive } } } : {}),
  };
  const hotelWithProvider = { hotel: { isActive: options.hotelActive ?? true } };
  const bookingModel = {
    findById: findByIdMock(booking, flightWithProvider),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const hotelModel = {
    findById: findByIdMock(booking, hotelWithProvider),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const paymentModel: any = {
    findOne: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async (data: object) => makePayment({ ...data, stripePaymentIntentId: undefined })),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    // Behaves like MongoDB's atomic findOneAndUpdate on the payment that findOne() returns:
    // it only matches when the status is in the filter, and the first caller changes it.
    findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
      const payment = await paymentModel.findOne(filter);
      if (!payment || !filter.status.$in.includes(payment.status)) return null;
      Object.assign(payment, update.$set);
      return payment;
    }),
  };
  const stripe = {
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi_new', client_secret: 'secret_new' }),

      retrieve: jest.fn(),
      cancel: jest.fn().mockResolvedValue({}),
    },
    webhooks: { constructEvent: jest.fn() },
  };
  const config = { get: jest.fn((key: string) => (key === 'STRIPE_WEBHOOK_SECRET' ? options.webhookSecret : undefined)) };
  // PAY-02 PoliciesService: accepted unless a test says otherwise.
  const policies = { assertAccepted: jest.fn().mockResolvedValue(undefined) };
  // PAY-03 RefundsService
  const refunds = {
    findByBooking: jest.fn().mockResolvedValue(null),
    refundUnconfirmedPayment: jest.fn().mockResolvedValue(undefined),
    handleStripeRefund: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PaymentsService(
    paymentModel as any,
    bookingModel as any,
    hotelModel as any,
    options.stripe === false ? null : (stripe as any),
    config as any,
    policies as any,
    refunds as any,
  );
  return { service, paymentModel, bookingModel, hotelModel, stripe, policies, refunds };
}

const dto = { bookingType: BookingType.FLIGHT, bookingId: bookingId.toString() };

describe('PaymentsService (PAY-01)', () => {
  describe('create', () => {
    it('creates one payment per booking for fares + baggage in the platform currency', async () => {
      const { service, stripe, paymentModel } = setup();
      const result = await service.create(userId, dto);

      expect(paymentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ _id: bookingId, amount: 120.5, currency: 'USD', status: PaymentStatus.PENDING }),
      );
      expect(paymentModel.create.mock.calls[0][0]).not.toHaveProperty('failureReason');
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 12050, currency: 'usd' }),
      );
      expect(result.clientSecret).toBe('secret_new');
      expect(result.stripePaymentIntentId).toBe('pi_new');
    });

    it("hides another user's booking as not found", async () => {
      const { service } = setup({ booking: makeBooking({ user: new Types.ObjectId() }) });
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a booking that is not Pending Payment', async () => {
      const { service } = setup({ booking: makeBooking({ status: 'CONFIRMED' }) });
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a booking whose hold has expired', async () => {
      const { service } = setup({ booking: makeBooking({ holdExpiresAt: new Date(Date.now() - 1000) }) });
      await expect(service.create(userId, dto)).rejects.toThrow('The booking hold has expired');
    });

    it('blocks payment until the provider policies are accepted (PAY-02 assertAccepted)', async () => {
      const { service, stripe, policies } = setup();
      policies.assertAccepted.mockRejectedValue(new ForbiddenException('Provider policies must be accepted before payment'));
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(policies.assertAccepted).toHaveBeenCalledWith(BookingType.FLIGHT, bookingId.toString());
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("rejects another user's booking as not found", async () => {
      const { service } = setup({ booking: makeBooking({ user: new Types.ObjectId() }) });
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a hotel reservation that the FLT-22/HTL-18 expiry job already marked Expired', async () => {
      const { service } = setup({ booking: makeBooking({ status: 'EXPIRED' }) });
      await expect(service.create(userId, { ...dto, bookingType: BookingType.HOTEL })).rejects.toThrow(
        'Only a Pending Payment booking can be paid',
      );
    });

    it('rejects an already paid booking', async () => {
      const { service, paymentModel } = setup();
      paymentModel.findById.mockResolvedValue(makePayment({ status: PaymentStatus.SUCCEEDED }));
      await expect(service.create(userId, dto)).rejects.toThrow('This booking is already paid');
    });

    it('returns the same open PaymentIntent when asked twice', async () => {
      const { service, paymentModel, stripe } = setup();
      paymentModel.findById.mockResolvedValue(makePayment());
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', status: 'requires_payment_method', client_secret: 'secret_1' });

      const result = await service.create(userId, dto);
      expect(result.clientSecret).toBe('secret_1');
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('uses the existing payment when two requests create it at the same time (no double charge)', async () => {
      const { service, paymentModel, stripe } = setup();
      const other = makePayment({ stripePaymentIntentId: 'pi_other' });
      paymentModel.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(other);
      paymentModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_other', status: 'requires_payment_method', client_secret: 'secret_other' });

      const result = await service.create(userId, dto);
      expect(result.clientSecret).toBe('secret_other');
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('cancels its own PaymentIntent if another request attached one first', async () => {
      const { service, paymentModel, stripe } = setup();
      paymentModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_new');
    });

    it('answers 503 when Stripe is not configured', async () => {
      const { service } = setup({ stripe: false });
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('retry', () => {
    it('reopens a failed payment within the hold', async () => {
      const { service, paymentModel, stripe } = setup();
      const payment = makePayment({ status: PaymentStatus.FAILED });
      paymentModel.findById.mockResolvedValue(payment);
      stripe.paymentIntents.retrieve.mockResolvedValue({ status: 'requires_payment_method', client_secret: 'secret_1' });

      const result = await service.retry(userId, payment._id.toString());
      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(result.clientSecret).toBe('secret_1');
      expect(paymentModel.updateOne).toHaveBeenCalledWith(
        { _id: payment._id, status: PaymentStatus.FAILED },
        { $set: { status: PaymentStatus.PENDING } },
      );
    });

    it('rejects retry after the hold has expired', async () => {
      const { service, paymentModel } = setup({ booking: makeBooking({ holdExpiresAt: new Date(Date.now() - 1000) }) });
      paymentModel.findById.mockResolvedValue(makePayment({ status: PaymentStatus.FAILED }));
      await expect(service.retry(userId, new Types.ObjectId().toString())).rejects.toBeInstanceOf(ConflictException);
    });

    it('checks PAY-02 policy acceptance again before a retry', async () => {
      const { service, paymentModel, policies, stripe } = setup();
      paymentModel.findById.mockResolvedValue(makePayment({ status: PaymentStatus.FAILED }));
      policies.assertAccepted.mockRejectedValue(new ForbiddenException('Provider policies must be accepted before payment'));
      await expect(service.retry(userId, new Types.ObjectId().toString())).rejects.toBeInstanceOf(ForbiddenException);
      expect(paymentModel.updateOne).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('rejects retry of a payment that did not fail', async () => {
      const { service, paymentModel } = setup();
      paymentModel.findById.mockResolvedValue(makePayment());
      await expect(service.retry(userId, new Types.ObjectId().toString())).rejects.toThrow('Only a failed payment can be retried');
    });
  });

  describe('findOne', () => {
    it('shows the Stripe error for a failed payment without storing it', async () => {
      const { service, paymentModel, stripe } = setup();
      const payment = makePayment({ status: PaymentStatus.FAILED });
      paymentModel.findById.mockResolvedValue(payment);
      stripe.paymentIntents.retrieve.mockResolvedValue({ last_payment_error: { message: 'Your card was declined.' } });

      const result = await service.findOne(userId, payment._id.toString());
      expect(result.failureReason).toBe('Your card was declined.');
      expect(payment.save).not.toHaveBeenCalled();
    });

    it('shows the refund status of the booking with its payment (PAY-03)', async () => {
      const { service, paymentModel, refunds } = setup();
      const payment = makePayment({ status: PaymentStatus.REFUNDED });
      paymentModel.findById.mockResolvedValue(payment);
      refunds.findByBooking.mockResolvedValue({ id: 'r1', status: 'refunded', amount: 120.5 });

      const result = await service.findOne(userId, payment._id.toString());
      expect(refunds.findByBooking).toHaveBeenCalledWith(BookingType.FLIGHT, bookingId);
      expect(result.refund).toEqual(expect.objectContaining({ status: 'refunded' }));
    });
  });

  describe('webhook', () => {
    const now = Math.floor(Date.now() / 1000);

    it('rejects an invalid signature', async () => {
      const { service, stripe } = setup({ webhookSecret: 'whsec' });
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('bad');
      });
      await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('confirms the booking only after a verified succeeded PaymentIntent', async () => {
      const { service, stripe, paymentModel, bookingModel } = setup({ webhookSecret: 'whsec' });
      const payment = makePayment();
      paymentModel.findOne.mockResolvedValue(payment);
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: 12050, currency: 'usd' } },
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(bookingModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING_PAYMENT' }),
        { $set: { status: 'CONFIRMED', payment: payment._id } },
      );
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(payment.paidAt).toEqual(new Date(now * 1000));
    });

    it('confirms a hotel reservation only while it is still Pending Payment within its hold', async () => {
      const { service, stripe, paymentModel, hotelModel } = setup({ webhookSecret: 'whsec' });
      paymentModel.findOne.mockResolvedValue(makePayment({ bookingType: BookingType.HOTEL }));
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: 12050, currency: 'usd' } },
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(hotelModel.updateOne).toHaveBeenCalledWith(
        { _id: bookingId, status: 'PENDING_PAYMENT', holdExpiresAt: { $gte: new Date(now * 1000) } },
        { $set: { status: 'CONFIRMED' } },
      );
    });

    const succeeded = { type: 'payment_intent.succeeded', created: 0, data: { object: { id: 'pi_1', amount_received: 12050, currency: 'usd' } } };

    it('runs after-confirmation handlers (HTL-17 / FLT-23) once PAY-01 has confirmed the booking', async () => {
      const { service, stripe, paymentModel, hotelModel } = setup({ webhookSecret: 'whsec' });
      paymentModel.findOne.mockResolvedValue(makePayment({ bookingType: BookingType.HOTEL }));
      stripe.webhooks.constructEvent.mockReturnValue({ ...succeeded, created: now });
      const handler = jest.fn().mockResolvedValue(undefined);
      service.onBookingConfirmed(handler);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(hotelModel.updateOne).toHaveBeenCalled(); // PAY-01 keeps the confirmation
      expect(handler).toHaveBeenCalledWith({
        bookingType: BookingType.HOTEL,
        bookingId: bookingId.toString(),
        paymentId: 'pay1',
        paidAt: new Date(now * 1000),
      });
    });

    it('does not run the handlers when the booking was not confirmed (hold ended)', async () => {
      const { service, stripe, paymentModel, bookingModel } = setup({ webhookSecret: 'whsec' });
      paymentModel.findOne.mockResolvedValue(makePayment());
      stripe.webhooks.constructEvent.mockReturnValue({ ...succeeded, created: now });
      bookingModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
      const handler = jest.fn();
      service.onBookingConfirmed(handler);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(handler).not.toHaveBeenCalled();
    });

    it('a failing handler never turns the paid, confirmed booking into an error', async () => {
      const { service, stripe, paymentModel, bookingModel } = setup({ webhookSecret: 'whsec' });
      const payment = makePayment();
      paymentModel.findOne.mockResolvedValue(payment);
      stripe.webhooks.constructEvent.mockReturnValue({ ...succeeded, created: now });
      const second = jest.fn().mockResolvedValue(undefined);
      service.onBookingConfirmed(jest.fn().mockRejectedValue(new Error('notification failed')));
      service.onBookingConfirmed(second);

      await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toBeUndefined();
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(bookingModel.updateOne).toHaveBeenCalled();
      expect(second).toHaveBeenCalled(); // the other handlers still run
    });

    describe('the same payment_intent.succeeded delivered more than once', () => {
      const succeededEvent = {
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: 12050, currency: 'usd' } },
      };

      it('two deliveries at the same moment confirm the booking once and refund nothing', async () => {
        const { service, stripe, paymentModel, bookingModel, refunds } = setup({ webhookSecret: 'whsec' });
        const payment = makePayment();
        paymentModel.findOne.mockResolvedValue(payment);
        stripe.webhooks.constructEvent.mockReturnValue(succeededEvent);
        // The second update finds the booking already confirmed.
        bookingModel.updateOne.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValue({ modifiedCount: 0 });

        await Promise.all([
          service.handleWebhook(Buffer.from('{}'), 'sig'),
          service.handleWebhook(Buffer.from('{}'), 'sig'),
        ]);

        expect(bookingModel.updateOne).toHaveBeenCalledTimes(1);
        expect(refunds.refundUnconfirmedPayment).not.toHaveBeenCalled();
        expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      });

      it.each([PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED])(
        'a re-sent event does not change a %s payment',
        async (status) => {
          const { service, stripe, paymentModel, bookingModel, refunds } = setup({ webhookSecret: 'whsec' });
          const payment = makePayment({ status });
          paymentModel.findOne.mockResolvedValue(payment);
          stripe.webhooks.constructEvent.mockReturnValue(succeededEvent);

          await service.handleWebhook(Buffer.from('{}'), 'sig');

          expect(payment.status).toBe(status);
          expect(bookingModel.updateOne).not.toHaveBeenCalled();
          expect(refunds.refundUnconfirmedPayment).not.toHaveBeenCalled();
        },
      );

      it('records the payment with one atomic update limited to pending, failed or expired', async () => {
        const { service, stripe, paymentModel } = setup({ webhookSecret: 'whsec' });
        paymentModel.findOne.mockResolvedValue(makePayment());
        stripe.webhooks.constructEvent.mockReturnValue(succeededEvent);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(paymentModel.findOneAndUpdate).toHaveBeenCalledWith(
          {
            stripePaymentIntentId: 'pi_1',
            status: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.EXPIRED] },
          },
          { $set: { status: PaymentStatus.SUCCEEDED, paidAt: new Date(now * 1000) } },
          { returnDocument: 'after' },
        );
      });
    });

    describe('refunds for money taken without a confirmed booking (PAY-03)', () => {
      const event = (amount = 12050) => ({
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: amount, currency: 'usd' } },
      });

      it('refunds in full when the hold ended before payment', async () => {
        const { service, stripe, paymentModel, bookingModel, refunds } = setup({ webhookSecret: 'whsec' });
        const payment = makePayment();
        paymentModel.findOne.mockResolvedValue(payment);
        stripe.webhooks.constructEvent.mockReturnValue(event());
        bookingModel.updateOne.mockResolvedValue({ modifiedCount: 0 });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(refunds.refundUnconfirmedPayment).toHaveBeenCalledWith(payment, 120.5, 'Booking not confirmed: hold ended');
      });

      it('refunds in full when the provider was deactivated', async () => {
        const { service, stripe, paymentModel, refunds } = setup({ webhookSecret: 'whsec', airlineActive: false });
        const payment = makePayment();
        paymentModel.findOne.mockResolvedValue(payment);
        stripe.webhooks.constructEvent.mockReturnValue(event());

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(refunds.refundUnconfirmedPayment).toHaveBeenCalledWith(payment, 120.5, 'Booking not confirmed: provider deactivated');
      });

      it('refunds the amount actually received when it does not match', async () => {
        const { service, stripe, paymentModel, bookingModel, refunds } = setup({ webhookSecret: 'whsec' });
        const payment = makePayment();
        paymentModel.findOne.mockResolvedValue(payment);
        stripe.webhooks.constructEvent.mockReturnValue(event(100));

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(bookingModel.updateOne).not.toHaveBeenCalled();
        expect(refunds.refundUnconfirmedPayment).toHaveBeenCalledWith(payment, 1, 'Booking not confirmed: amount mismatch');
      });

      it('does not refund a confirmed booking', async () => {
        const { service, stripe, paymentModel, refunds } = setup({ webhookSecret: 'whsec' });
        paymentModel.findOne.mockResolvedValue(makePayment());
        stripe.webhooks.constructEvent.mockReturnValue(event());

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(refunds.refundUnconfirmedPayment).not.toHaveBeenCalled();
      });

      it.each(['refund.updated', 'refund.failed'])('passes %s webhooks to the refunds service', async (type) => {
        const { service, stripe, refunds } = setup({ webhookSecret: 'whsec' });
        stripe.webhooks.constructEvent.mockReturnValue({ type, created: now, data: { object: { id: 're_1', status: 'succeeded' } } });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(refunds.handleStripeRefund).toHaveBeenCalledWith({ id: 're_1', status: 'succeeded' });
      });
    });

    describe('deactivated providers (ACC-15)', () => {
      it('does not confirm a hotel reservation when the hotel was deactivated', async () => {
        const { service, stripe, paymentModel, hotelModel } = setup({ webhookSecret: 'whsec', hotelActive: false });
        const payment = makePayment({ bookingType: BookingType.HOTEL });
        paymentModel.findOne.mockResolvedValue(payment);
        stripe.webhooks.constructEvent.mockReturnValue({ ...succeeded, created: now });
        const handler = jest.fn();
        service.onBookingConfirmed(handler);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(hotelModel.updateOne).not.toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
        expect(payment.status).toBe(PaymentStatus.SUCCEEDED); // kept as paid so it can be refunded
      });

      it('does not confirm a flight booking when the airline was deactivated', async () => {
        const { service, stripe, paymentModel, bookingModel } = setup({ webhookSecret: 'whsec', airlineActive: false });
        paymentModel.findOne.mockResolvedValue(makePayment());
        stripe.webhooks.constructEvent.mockReturnValue({ ...succeeded, created: now });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(bookingModel.updateOne).not.toHaveBeenCalled();
      });

      it('does not confirm a round trip when the return flight airline was deactivated', async () => {
        const { service, stripe, paymentModel, bookingModel } = setup({
          webhookSecret: 'whsec',
          returnAirlineActive: false,
        });
        paymentModel.findOne.mockResolvedValue(makePayment());
        stripe.webhooks.constructEvent.mockReturnValue({ ...succeeded, created: now });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(bookingModel.updateOne).not.toHaveBeenCalled();
      });

      it('confirms when the provider is active', async () => {
        const { service, stripe, paymentModel, bookingModel } = setup({ webhookSecret: 'whsec', returnAirlineActive: true });
        paymentModel.findOne.mockResolvedValue(makePayment());
        stripe.webhooks.constructEvent.mockReturnValue({ ...succeeded, created: now });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(bookingModel.updateOne).toHaveBeenCalled();
      });
    });

    it('does not confirm when the paid amount does not match', async () => {
      const { service, stripe, paymentModel, bookingModel } = setup({ webhookSecret: 'whsec' });
      paymentModel.findOne.mockResolvedValue(makePayment());
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: 100, currency: 'usd' } },
      });
      await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(bookingModel.updateOne).not.toHaveBeenCalled();
    });

    it('confirms nothing twice for a repeated event', async () => {
      const { service, stripe, paymentModel, bookingModel } = setup({ webhookSecret: 'whsec' });
      paymentModel.findOne.mockResolvedValue(makePayment({ status: PaymentStatus.SUCCEEDED }));
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: 12050, currency: 'usd' } },
      });
      await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(bookingModel.updateOne).not.toHaveBeenCalled();
    });

    it('leaves the booking unconfirmed when paid after the hold ended', async () => {
      const { service, stripe, paymentModel, bookingModel } = setup({ webhookSecret: 'whsec' });
      const payment = makePayment();
      paymentModel.findOne.mockResolvedValue(payment);
      bookingModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: 12050, currency: 'usd' } },
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(bookingModel.updateOne).toHaveBeenCalledTimes(1);
    });

    it('marks a failed PaymentIntent as failed without storing the reason', async () => {
      const { service, stripe, paymentModel } = setup({ webhookSecret: 'whsec' });
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        created: now,
        data: { object: { id: 'pi_1', last_payment_error: { message: 'Your card was declined.' } } },
      });
      await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(paymentModel.updateOne).toHaveBeenCalledWith(
        { stripePaymentIntentId: 'pi_1', status: PaymentStatus.PENDING },
        { $set: { status: PaymentStatus.FAILED } },
      );
    });
  });

  describe('cancelExpiredPayments', () => {
    it('cancels the PaymentIntent and marks the payment expired', async () => {
      const { service, stripe, paymentModel } = setup();
      paymentModel.find.mockResolvedValue([makePayment()]);
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', status: 'requires_payment_method' });

      expect(await service.cancelExpiredPayments()).toBe(1);
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_1');
    });

    it('leaves a succeeded PaymentIntent for the webhook', async () => {
      const { service, stripe, paymentModel } = setup();
      paymentModel.find.mockResolvedValue([makePayment()]);
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', status: 'succeeded' });

      expect(await service.cancelExpiredPayments()).toBe(0);
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });
  });

  describe('bookingAmount (FLT-21 total)', () => {
    const flight = {
      flightNumber: 'MS777',
      airlineName: 'EgyptAir',
      departureAirport: { iataCode: 'CAI', name: 'Cairo', city: 'Cairo', timezone: 'Africa/Cairo' },
      arrivalAirport: { iataCode: 'DXB', name: 'Dubai', city: 'Dubai', timezone: 'Asia/Dubai' },
      departureTime: new Date('2026-12-05T08:00:00Z'),
      arrivalTime: new Date('2026-12-05T11:00:00Z'),
      durationMinutes: 180,
    };
    const summaryTotal = (totalPrice: number, baggageFees?: number) =>
      buildBookingSummary(
        {
          id: 'b1',
          status: 'PENDING_PAYMENT',
          tripType: 'ONE_WAY',
          cabinClass: 'ECONOMY',
          currency: 'USD',
          totalPrice,
          baggageFees,
          passengers: [],
        },
        flight,
        undefined,
      ).pricing.total;

    it.each([
      [100.5, 20],
      [199.99, 0],
      [0.105, 0.105],
      [333.335, 49.995],
      [120, undefined],
    ])('charges exactly the FLT-21 summary total (fares %p + baggage %p)', (fares, bags) => {
      expect(bookingAmount(fares, bags)).toBe(summaryTotal(fares, bags));
    });

    it('creates the PaymentIntent for the FLT-21 summary total including baggage fees', async () => {
      const { service, stripe, paymentModel } = setup();
      await service.create(userId, dto);
      const expected = summaryTotal(100.5, 20);
      expect(paymentModel.create).toHaveBeenCalledWith(expect.objectContaining({ amount: expected }));
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: Math.round(expected * 100) }),
      );
    });
  });
});
