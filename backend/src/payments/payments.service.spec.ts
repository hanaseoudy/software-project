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

function setup(options: { booking?: unknown; stripe?: boolean; webhookSecret?: string } = {}) {
  const booking = 'booking' in options ? options.booking : makeBooking();
  const bookingModel = {
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(booking) }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const hotelModel = {
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(booking) }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const paymentModel = {
    findOne: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async (data: object) => makePayment({ ...data, stripePaymentIntentId: undefined })),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
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
  const service = new PaymentsService(
    paymentModel as any,
    bookingModel as any,
    hotelModel as any,
    options.stripe === false ? null : (stripe as any),
    config as any,
    policies as any,
  );
  return { service, paymentModel, bookingModel, hotelModel, stripe, policies };
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

    it('lets a registered confirmer (HTL-17 / FLT-23) confirm instead of the built-in step', async () => {
      const { service, stripe, paymentModel, hotelModel } = setup({ webhookSecret: 'whsec' });
      paymentModel.findOne.mockResolvedValue(makePayment({ bookingType: BookingType.HOTEL }));
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: 12050, currency: 'usd' } },
      });
      const confirmer = jest.fn().mockResolvedValue(true);
      service.registerBookingConfirmer(BookingType.HOTEL, confirmer);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(confirmer).toHaveBeenCalledWith({
        bookingType: BookingType.HOTEL,
        bookingId: bookingId.toString(),
        paymentId: 'pay1',
        paidAt: new Date(now * 1000),
      });
      expect(hotelModel.updateOne).not.toHaveBeenCalled();
    });

    it('keeps the payment recorded as succeeded if a registered confirmer throws', async () => {
      const { service, stripe, paymentModel } = setup({ webhookSecret: 'whsec' });
      const payment = makePayment();
      paymentModel.findOne.mockResolvedValue(payment);
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        created: now,
        data: { object: { id: 'pi_1', amount_received: 12050, currency: 'usd' } },
      });
      service.registerBookingConfirmer(BookingType.FLIGHT, jest.fn().mockRejectedValue(new Error('hold expired')));

      await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toBeUndefined();
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
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
