import { Types } from 'mongoose';
import { FlightChangeService } from './flight-change.service';

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
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_MINUTE: '* * * * *' },
}));
jest.mock('@nestjs/mongoose', () => ({ InjectModel: () => () => undefined }));
jest.mock('../airlines/schemas/airline.schema', () => ({
  Airline: { name: 'Airline' },
}));
jest.mock('../flights/schemas/flight.schema', () => ({
  Flight: { name: 'Flight' },
  FlightStatus: { SCHEDULED: 'SCHEDULED', CANCELLED: 'CANCELLED' },
}));
jest.mock('../payments/payments.service', () => ({
  PaymentsService: class {},
}));
jest.mock('../payments/refunds.service', () => ({ RefundsService: class {} }));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));
jest.mock('../notifications/enums/notification.enums', () => ({
  NotificationType: { BOOKING_CHANGED: 'BOOKING_CHANGED' },
}));
jest.mock('./flight-bookings.service', () => ({
  FlightBookingsService: class {},
}));
jest.mock('./schemas/flight-booking.schema', () => ({
  FlightBooking: { name: 'FlightBooking' },
  FlightBookingStatus: {
    CONFIRMED: 'CONFIRMED',
    PENDING_PAYMENT: 'PENDING_PAYMENT',
  },
}));
jest.mock('./schemas/flight-change.schema', () => ({
  FlightChange: { name: 'FlightChange' },
  FlightChangeStatus: {
    PENDING_PAYMENT: 'PENDING_PAYMENT',
    COMPLETED: 'COMPLETED',
    EXPIRED: 'EXPIRED',
    FAILED: 'FAILED',
  },
}));
jest.mock('./schemas/passenger.schema', () => ({
  PassengerType: { ADULT: 'ADULT', CHILD: 'CHILD', INFANT: 'INFANT' },
}));

const now = new Date('2026-12-01T10:00:00Z');
const userId = new Types.ObjectId();
const bookingId = new Types.ObjectId();
const airlineId = new Types.ObjectId();
const cai = new Types.ObjectId();
const dxb = new Types.ObjectId();
const lhr = new Types.ObjectId();

const oldOut = new Types.ObjectId();
const newOut = new Types.ObjectId();
const oldRet = new Types.ObjectId();
const newRet = new Types.ObjectId();

function makeFlight(
  id: Types.ObjectId,
  opts: {
    price?: number;
    from?: Types.ObjectId;
    to?: Types.ObjectId;
    departure?: string;
    arrival?: string;
    status?: string;
  } = {},
) {
  return {
    _id: id,
    airline: airlineId,
    flightNumber: `MS${String(id).slice(-3)}`,
    departureAirport: opts.from ?? cai,
    arrivalAirport: opts.to ?? dxb,
    departureTime: new Date(opts.departure ?? '2026-12-10T10:00:00Z'),
    arrivalTime: new Date(opts.arrival ?? '2026-12-10T13:00:00Z'),
    status: opts.status ?? 'SCHEDULED',
    cabins: [
      {
        cabinClass: 'ECONOMY',
        price: opts.price ?? 100,
        freeBags: 1,
        maxBagWeightKg: 23,
      },
    ],
  };
}

const passengers = [
  { type: 'ADULT', baggage: [] },
  { type: 'ADULT', baggage: [] },
];

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    _id: bookingId,
    user: userId,
    status: 'CONFIRMED',
    bookingReference: 'FLT-ABCD2345',
    tripType: 'ONE_WAY',
    cabinClass: 'ECONOMY',
    currency: 'USD',
    outboundFlight: oldOut,
    returnFlight: undefined,
    passengers,
    totalPrice: 200, // 2 adults x 100
    baggageFees: 0,
    ...overrides,
  };
}

function makeChangeDoc(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: new Types.ObjectId(),
    booking: bookingId,
    user: userId,
    oldOutboundFlight: oldOut,
    oldReturnFlight: undefined,
    newOutboundFlight: newOut,
    newReturnFlight: undefined,
    cabinClass: 'ECONOMY',
    seats: 2,
    oldAmount: 200,
    newAmount: 260,
    newTotalPrice: 260,
    newBaggageFees: 0,
    difference: 60,
    status: 'PENDING_PAYMENT',
    stripePaymentIntentId: 'pi_1',
    expiresAt: new Date('2026-12-01T10:10:00Z'),
    ...overrides,
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
}

function setup(
  opts: {
    booking?: unknown;
    flights?: Array<ReturnType<typeof makeFlight>>;
    holdResults?: boolean[];
    updatedBooking?: unknown;
  } = {},
) {
  const flights = opts.flights ?? [
    makeFlight(oldOut, { price: 100 }),
    makeFlight(newOut, {
      price: 100,
      departure: '2026-12-12T10:00:00Z',
      arrival: '2026-12-12T13:00:00Z',
    }),
  ];
  const bookingModel = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.booking === undefined ? makeBooking() : opts.booking,
      ),
    findOneAndUpdate: jest
      .fn()
      .mockResolvedValue(
        opts.updatedBooking === undefined
          ? { ...makeBooking(), outboundFlight: newOut }
          : opts.updatedBooking,
      ),
  };
  const flightModel = {
    findById: jest.fn((id: Types.ObjectId) => ({
      lean: () =>
        Promise.resolve(
          flights.find((f) => String(f._id) === String(id)) ?? null,
        ),
    })),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const airlineModel = {
    findById: jest.fn(() => ({
      lean: () =>
        Promise.resolve({
          isActive: true,
          baggagePolicy: { extraBagPrice: 10, maxExtraBagsPerPassenger: 2 },
        }),
    })),
  };
  const changeModel = {
    create: jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve(
          makeChangeDoc({ ...data, stripePaymentIntentId: undefined }),
        ),
      ),
    findById: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'claimed' }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  };
  const holds = [...(opts.holdResults ?? [])];
  const bookingsService = {
    holdSeats: jest.fn(async () => (holds.length ? holds.shift()! : true)),
    releaseSeats: jest.fn().mockResolvedValue(undefined),
  };
  const paymentsService = {
    onFarePaid: jest.fn(),
    createFarePayment: jest.fn().mockResolvedValue({
      paymentIntentId: 'pi_new',
      clientSecret: 'secret_new',
    }),
    cancelFarePayment: jest.fn().mockResolvedValue(true),
    refundFarePayment: jest.fn().mockResolvedValue(undefined),
  };
  const refundsService = {
    issueFareDifferenceRefund: jest.fn().mockResolvedValue({
      id: 'r1',
      amount: 40,
      currency: 'USD',
      status: 'pending',
    }),
  };
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const service = new FlightChangeService(
    bookingModel as never,
    flightModel as never,
    airlineModel as never,
    changeModel as never,
    bookingsService as never,
    paymentsService as never,
    refundsService as never,
    notificationsService as never,
  );
  return {
    service,
    bookingModel,
    flightModel,
    changeModel,
    bookingsService,
    paymentsService,
    refundsService,
    notificationsService,
  };
}

const user = userId.toString();
const bid = bookingId.toString();
const cheaper = () => [
  makeFlight(oldOut, { price: 100 }),
  makeFlight(newOut, {
    price: 80,
    departure: '2026-12-12T10:00:00Z',
    arrival: '2026-12-12T13:00:00Z',
  }),
];
const pricier = () => [
  makeFlight(oldOut, { price: 100 }),
  makeFlight(newOut, {
    price: 130,
    departure: '2026-12-12T10:00:00Z',
    arrival: '2026-12-12T13:00:00Z',
  }),
];

describe('FlightChangeService.getQuote', () => {
  it('shows the fare difference when the new flight costs more', async () => {
    const { service } = setup({ flights: pricier() });
    const quote = await service.getQuote(
      user,
      bid,
      { outboundFlightId: String(newOut) },
      now,
    );
    expect(quote).toMatchObject({
      current: { amount: 200 },
      proposed: { amount: 260 },
      difference: 60,
      outcome: 'PAY_DIFFERENCE',
    });
  });

  it('shows a refund when the new flight costs less', async () => {
    const { service } = setup({ flights: cheaper() });
    const quote = await service.getQuote(
      user,
      bid,
      { outboundFlightId: String(newOut) },
      now,
    );
    expect(quote).toMatchObject({
      difference: -40,
      outcome: 'REFUND_DIFFERENCE',
    });
  });

  it('shows no payment when the price is the same', async () => {
    const { service } = setup();
    const quote = await service.getQuote(
      user,
      bid,
      { outboundFlightId: String(newOut) },
      now,
    );
    expect(quote).toMatchObject({ difference: 0, outcome: 'NO_PAYMENT' });
  });

  it('rejects a flight on another route', async () => {
    const { service } = setup({
      flights: [makeFlight(oldOut), makeFlight(newOut, { to: lhr })],
    });
    await expect(
      service.getQuote(user, bid, { outboundFlightId: String(newOut) }, now),
    ).rejects.toThrow('same route');
  });

  it('rejects a flight that is not bookable', async () => {
    const { service } = setup({
      flights: [
        makeFlight(oldOut),
        makeFlight(newOut, { status: 'CANCELLED' }),
      ],
    });
    await expect(
      service.getQuote(user, bid, { outboundFlightId: String(newOut) }, now),
    ).rejects.toThrow('not available for booking');
  });

  it('rejects the flight that is already booked', async () => {
    const { service } = setup();
    await expect(
      service.getQuote(user, bid, { outboundFlightId: String(oldOut) }, now),
    ).rejects.toThrow('different flight');
  });

  it('needs a new flight', async () => {
    const { service } = setup();
    await expect(service.getQuote(user, bid, {}, now)).rejects.toThrow(
      'Choose the new outboundFlightId',
    );
  });

  it('only works for a CONFIRMED booking', async () => {
    const { service } = setup({
      booking: makeBooking({ status: 'PENDING_PAYMENT' }),
    });
    await expect(
      service.getQuote(user, bid, { outboundFlightId: String(newOut) }, now),
    ).rejects.toThrow('Only a confirmed booking can be changed');
  });

  it('waits for the booking reference', async () => {
    const { service } = setup({
      booking: makeBooking({ bookingReference: undefined }),
    });
    await expect(
      service.getQuote(user, bid, { outboundFlightId: String(newOut) }, now),
    ).rejects.toThrow('Booking reference is not ready yet');
  });

  it('is blocked after departure', async () => {
    const { service } = setup({
      flights: [
        makeFlight(oldOut, {
          departure: '2026-12-01T09:00:00Z',
          arrival: '2026-12-01T12:00:00Z',
        }),
        makeFlight(newOut),
      ],
    });
    await expect(
      service.getQuote(user, bid, { outboundFlightId: String(newOut) }, now),
    ).rejects.toThrow('after departure');
  });

  it("does not find another user's booking", async () => {
    const { service, bookingModel } = setup({ booking: null });
    await expect(
      service.getQuote(user, bid, { outboundFlightId: String(newOut) }, now),
    ).rejects.toThrow('Booking not found');
    expect(bookingModel.findOne).toHaveBeenCalledWith({
      _id: bookingId,
      user: userId,
    });
  });

  it('rejects a return flight for a one-way booking', async () => {
    const { service } = setup();
    await expect(
      service.getQuote(user, bid, { returnFlightId: String(newRet) }, now),
    ).rejects.toThrow('no return flight');
  });

  describe('round trip', () => {
    const roundTrip = () =>
      makeBooking({
        tripType: 'ROUND_TRIP',
        returnFlight: oldRet,
        totalPrice: 400,
      });
    const legs = (retDeparture: string, retArrival: string) => [
      makeFlight(oldOut),
      makeFlight(oldRet, {
        from: dxb,
        to: cai,
        departure: '2026-12-20T10:00:00Z',
        arrival: '2026-12-20T13:00:00Z',
      }),
      makeFlight(newRet, {
        from: dxb,
        to: cai,
        departure: retDeparture,
        arrival: retArrival,
        price: 120,
      }),
    ];

    it('changes only the return flight and prices both legs', async () => {
      const { service } = setup({
        booking: roundTrip(),
        flights: legs('2026-12-22T10:00:00Z', '2026-12-22T13:00:00Z'),
      });
      const quote = await service.getQuote(
        user,
        bid,
        { returnFlightId: String(newRet) },
        now,
      );
      expect(quote).toMatchObject({
        current: { amount: 400 },
        proposed: { amount: 440 },
        difference: 40,
      });
    });

    it('rejects a return flight that departs before the outbound flight arrives', async () => {
      const { service } = setup({
        booking: roundTrip(),
        flights: legs('2026-12-10T11:00:00Z', '2026-12-10T14:00:00Z'),
      });
      await expect(
        service.getQuote(user, bid, { returnFlightId: String(newRet) }, now),
      ).rejects.toThrow('depart after the outbound flight arrives');
    });
  });
});

describe('FlightChangeService.requestChange', () => {
  it('needs confirm: true', async () => {
    const { service } = setup();
    await expect(
      service.requestChange(
        user,
        bid,
        { outboundFlightId: String(newOut), confirm: false },
        now,
      ),
    ).rejects.toThrow('confirm must be true');
  });

  it('applies a cheaper flight at once, moves the seats and refunds the difference', async () => {
    const t = setup({ flights: cheaper() });
    const result = await t.service.requestChange(
      user,
      bid,
      { outboundFlightId: String(newOut), confirm: true },
      now,
    );

    expect(t.bookingsService.holdSeats).toHaveBeenCalledWith(
      String(newOut),
      'ECONOMY',
      2,
    );
    expect(t.bookingModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: bookingId,
        user: userId,
        status: 'CONFIRMED',
        outboundFlight: oldOut,
      }),
      { $set: { outboundFlight: newOut, totalPrice: 160, baggageFees: 0 } },
      { returnDocument: 'after' },
    );
    // old seats released, new held seats booked
    expect(t.flightModel.updateOne).toHaveBeenCalledTimes(2);
    expect(t.refundsService.issueFareDifferenceRefund).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId, amount: 40 }),
    );
    expect(t.notificationsService.create).toHaveBeenCalledTimes(1);
    // The change is already applied: it must not be reported as waiting for payment.
    expect(result).toMatchObject({
      status: 'COMPLETED',
      difference: -40,
      refund: { id: 'r1', status: 'pending' },
    });
    expect(result).not.toHaveProperty('warning');
  });

  it('applies a same-price flight without any payment or refund', async () => {
    const t = setup();
    const result = await t.service.requestChange(
      user,
      bid,
      { outboundFlightId: String(newOut), confirm: true },
      now,
    );
    expect(t.paymentsService.createFarePayment).not.toHaveBeenCalled();
    expect(t.refundsService.issueFareDifferenceRefund).not.toHaveBeenCalled();
    expect(t.bookingModel.findOneAndUpdate).toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'COMPLETED', difference: 0 });
  });

  it('keeps the change and warns when the refund cannot be created', async () => {
    const t = setup({ flights: cheaper() });
    t.refundsService.issueFareDifferenceRefund.mockRejectedValue(
      new Error('Stripe is not configured'),
    );
    const result = await t.service.requestChange(
      user,
      bid,
      { outboundFlightId: String(newOut), confirm: true },
      now,
    );
    expect((result as { refund?: unknown }).refund).toBeNull();
    expect(result).toHaveProperty('warning');
    expect(result).toMatchObject({ status: 'COMPLETED' });
    expect(t.bookingModel.findOneAndUpdate).toHaveBeenCalled();
  });

  it('holds the seats and asks for payment when the new flight costs more', async () => {
    const t = setup({ flights: pricier() });
    const result = await t.service.requestChange(
      user,
      bid,
      { outboundFlightId: String(newOut), confirm: true },
      now,
    );

    expect(t.paymentsService.createFarePayment).toHaveBeenCalledWith({
      amount: 60,
      changeId: expect.any(String),
      bookingId: bid,
    });
    // the booking does not change before the payment
    expect(t.bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(t.flightModel.updateOne).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'PENDING_PAYMENT',
      amountDue: 60,
      clientSecret: 'secret_new',
    });
  });

  it('releases the seats when the payment cannot be started', async () => {
    const t = setup({ flights: pricier() });
    t.paymentsService.createFarePayment.mockRejectedValue(
      new Error('Stripe is not configured'),
    );
    await expect(
      t.service.requestChange(
        user,
        bid,
        { outboundFlightId: String(newOut), confirm: true },
        now,
      ),
    ).rejects.toThrow('Stripe is not configured');
    expect(t.changeModel.deleteOne).toHaveBeenCalled();
    expect(t.bookingsService.releaseSeats).toHaveBeenCalledWith(
      String(newOut),
      'ECONOMY',
      2,
    );
  });

  it('rejects the change when the new flight has no free seats', async () => {
    const t = setup({ flights: cheaper(), holdResults: [false] });
    await expect(
      t.service.requestChange(
        user,
        bid,
        { outboundFlightId: String(newOut), confirm: true },
        now,
      ),
    ).rejects.toThrow('Not enough seats');
    expect(t.changeModel.create).not.toHaveBeenCalled();
    expect(t.bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('releases the first leg when the second leg has no free seats', async () => {
    const outRoute = makeFlight(oldOut);
    const t = setup({
      booking: makeBooking({
        tripType: 'ROUND_TRIP',
        returnFlight: oldRet,
        totalPrice: 400,
      }),
      flights: [
        outRoute,
        makeFlight(oldRet, {
          from: dxb,
          to: cai,
          departure: '2026-12-20T10:00:00Z',
          arrival: '2026-12-20T13:00:00Z',
        }),
        makeFlight(newOut, {
          departure: '2026-12-12T10:00:00Z',
          arrival: '2026-12-12T13:00:00Z',
        }),
        makeFlight(newRet, {
          from: dxb,
          to: cai,
          departure: '2026-12-22T10:00:00Z',
          arrival: '2026-12-22T13:00:00Z',
        }),
      ],
      holdResults: [true, false],
    });
    await expect(
      t.service.requestChange(
        user,
        bid,
        {
          outboundFlightId: String(newOut),
          returnFlightId: String(newRet),
          confirm: true,
        },
        now,
      ),
    ).rejects.toThrow('Not enough seats');
    expect(t.bookingsService.releaseSeats).toHaveBeenCalledTimes(1);
    expect(t.bookingsService.releaseSeats).toHaveBeenCalledWith(
      String(newOut),
      'ECONOMY',
      2,
    );
  });

  it('rejects a second change while one waits for payment', async () => {
    const t = setup({ flights: pricier() });
    t.changeModel.create.mockRejectedValue({ code: 11000 });
    await expect(
      t.service.requestChange(
        user,
        bid,
        { outboundFlightId: String(newOut), confirm: true },
        now,
      ),
    ).rejects.toThrow('already has a change waiting for payment');
    expect(t.bookingsService.releaseSeats).toHaveBeenCalled();
  });

  it('fails when the booking changed in the meantime and gives the seats back', async () => {
    const t = setup({ updatedBooking: null });
    await expect(
      t.service.requestChange(
        user,
        bid,
        { outboundFlightId: String(newOut), confirm: true },
        now,
      ),
    ).rejects.toThrow('changed or cancelled meanwhile');
    expect(t.bookingsService.releaseSeats).toHaveBeenCalledWith(
      String(newOut),
      'ECONOMY',
      2,
    );
    expect(t.notificationsService.create).not.toHaveBeenCalled();
  });
});

describe('FlightChangeService.onFarePaid', () => {
  const paidEvent = (over: Record<string, unknown> = {}) => ({
    changeId: String(new Types.ObjectId()),
    paymentIntentId: 'pi_1',
    amountReceived: 60,
    currency: 'USD',
    paidAt: new Date('2026-12-01T10:05:00Z'),
    ...over,
  });

  it('applies the change once the right amount is paid in time', async () => {
    const t = setup();
    const change = makeChangeDoc();
    t.changeModel.findById.mockResolvedValue(change);
    await t.service.onFarePaid(paidEvent());

    expect(t.bookingModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ outboundFlight: oldOut }),
      { $set: { outboundFlight: newOut, totalPrice: 260, baggageFees: 0 } },
      { returnDocument: 'after' },
    );
    expect(t.flightModel.updateOne).toHaveBeenCalledTimes(2);
    expect(t.paymentsService.refundFarePayment).not.toHaveBeenCalled();
  });

  it('refunds a payment with the wrong amount and does not change the booking', async () => {
    const t = setup();
    const change = makeChangeDoc();
    t.changeModel.findById.mockResolvedValue(change);
    await t.service.onFarePaid(paidEvent({ amountReceived: 10 }));

    expect(t.bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(t.paymentsService.refundFarePayment).toHaveBeenCalledWith(
      'pi_1',
      10,
      String(change._id),
    );
    expect(t.bookingsService.releaseSeats).toHaveBeenCalledWith(
      String(newOut),
      'ECONOMY',
      2,
    );
  });

  it('refunds a payment that arrives after the hold ended', async () => {
    const t = setup();
    t.changeModel.findById.mockResolvedValue(makeChangeDoc());
    await t.service.onFarePaid(
      paidEvent({ paidAt: new Date('2026-12-01T10:30:00Z') }),
    );

    expect(t.bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(t.paymentsService.refundFarePayment).toHaveBeenCalled();
  });

  it('refunds the payment when the booking was cancelled meanwhile', async () => {
    const t = setup({ updatedBooking: null });
    t.changeModel.findById.mockResolvedValue(makeChangeDoc());
    await t.service.onFarePaid(paidEvent());

    expect(t.paymentsService.refundFarePayment).toHaveBeenCalledWith(
      'pi_1',
      60,
      expect.any(String),
    );
    expect(t.bookingsService.releaseSeats).toHaveBeenCalled();
  });

  it('ignores an event for a change that is already handled', async () => {
    const t = setup();
    t.changeModel.findById.mockResolvedValue(
      makeChangeDoc({ status: 'COMPLETED' }),
    );
    await t.service.onFarePaid(paidEvent());

    expect(t.bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(t.paymentsService.refundFarePayment).not.toHaveBeenCalled();
  });

  it('refunds a payment for a change that already expired', async () => {
    const t = setup();
    t.changeModel.findById.mockResolvedValue(
      makeChangeDoc({ status: 'EXPIRED' }),
    );
    await t.service.onFarePaid(paidEvent());

    expect(t.bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(t.paymentsService.refundFarePayment).toHaveBeenCalled();
  });

  it('registers itself with the payments webhook', () => {
    const t = setup();
    t.service.onModuleInit();
    expect(t.paymentsService.onFarePaid).toHaveBeenCalledTimes(1);
  });
});

describe('FlightChangeService.expireStaleChanges', () => {
  it('cancels the payment, expires the change and releases the new seats', async () => {
    const t = setup();
    t.changeModel.find.mockReturnValue({
      limit: () => Promise.resolve([makeChangeDoc()]),
    });
    await t.service.expireStaleChanges();

    expect(t.paymentsService.cancelFarePayment).toHaveBeenCalledWith('pi_1');
    expect(t.changeModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_PAYMENT' }),
      { $set: { status: 'EXPIRED' } },
    );
    expect(t.bookingsService.releaseSeats).toHaveBeenCalledWith(
      String(newOut),
      'ECONOMY',
      2,
    );
  });

  it('leaves a change alone while its payment is being processed', async () => {
    const t = setup();
    t.paymentsService.cancelFarePayment.mockResolvedValue(false);
    t.changeModel.find.mockReturnValue({
      limit: () => Promise.resolve([makeChangeDoc()]),
    });
    await t.service.expireStaleChanges();

    expect(t.changeModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(t.bookingsService.releaseSeats).not.toHaveBeenCalled();
  });
});

describe('FlightChangeService.getChange', () => {
  it('returns the status of the own change', async () => {
    const t = setup();
    t.changeModel.findOne.mockResolvedValue(
      makeChangeDoc({ status: 'COMPLETED' }),
    );
    const result = await t.service.getChange(
      user,
      bid,
      String(new Types.ObjectId()),
    );
    expect(result).toMatchObject({ status: 'COMPLETED', difference: 60 });
  });

  it('does not find the change of another user', async () => {
    const t = setup();
    t.changeModel.findOne.mockResolvedValue(null);
    await expect(
      t.service.getChange(user, bid, String(new Types.ObjectId())),
    ).rejects.toThrow('Change not found');
  });

  it('rejects an invalid id', async () => {
    const t = setup();
    await expect(t.service.getChange(user, bid, 'nope')).rejects.toThrow(
      'Invalid ID',
    );
  });
});
