import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Airline } from '../airlines/schemas/airline.schema';
import { Flight, FlightStatus } from '../flights/schemas/flight.schema';
import { NotificationType } from '../notifications/enums/notification.enums';
import { NotificationsService } from '../notifications/notifications.service';
import type { FarePaidEvent } from '../payments/payments.service';
import { PaymentsService } from '../payments/payments.service';
import { RefundsService } from '../payments/refunds.service';
import {
  ChangeFlightBookingDto,
  ChangeFlightQueryDto,
} from './dto/change-flight-booking.dto';
import { FlightBookingsService } from './flight-bookings.service';
import {
  FlightBooking,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';
import {
  FlightChange,
  FlightChangeDocument,
  FlightChangeStatus,
} from './schemas/flight-change.schema';
import { PassengerType } from './schemas/passenger.schema';
import {
  BaggageRuleError,
  calculateLegBaggageFees,
} from './utils/baggage-fees';
import {
  CHANGE_HOLD_MS,
  chargeTotal,
  fareDifference,
  fareOutcome,
  isSameRoute,
  legFare,
} from './utils/flight-change';
import { hasDeparted } from './utils/flight-cancellation';

type FlightLean = Flight & { _id: Types.ObjectId };

/** One leg of the booking as it would be after the change. */
interface PlannedLeg {
  segment: 'OUTBOUND' | 'RETURN';
  flight: FlightLean;
  changed: boolean;
}

/**
 * FLT-27 (bonus): a registered user changes the date or flight of their own
 * CONFIRMED flight booking (same route and cabin). Seats on the new flight must
 * be available. A higher fare is paid through Stripe (the change only happens
 * once it is paid); a lower fare is refunded (PAY-03).
 */
@Injectable()
export class FlightChangeService implements OnModuleInit {
  private readonly logger = new Logger(FlightChangeService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBooking>,
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
    @InjectModel(FlightChange.name)
    private readonly changeModel: Model<FlightChange>,
    private readonly bookingsService: FlightBookingsService,
    private readonly paymentsService: PaymentsService,
    private readonly refundsService: RefundsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.paymentsService.onFarePaid((event) => this.onFarePaid(event));
  }

  /** What the user is shown before confirming: the new fare and what to pay or get back. */
  async getQuote(
    userId: string,
    bookingId: string,
    input: ChangeFlightQueryDto,
    now: Date = new Date(),
  ) {
    const plan = await this.plan(userId, bookingId, input, now);
    return {
      bookingId,
      cabinClass: plan.booking.cabinClass,
      currency: plan.booking.currency,
      current: {
        outboundFlightId: String(plan.booking.outboundFlight),
        returnFlightId: plan.booking.returnFlight
          ? String(plan.booking.returnFlight)
          : null,
        amount: plan.currentAmount,
      },
      proposed: {
        outboundFlightId: String(plan.legs[0].flight._id),
        returnFlightId: plan.legs[1] ? String(plan.legs[1].flight._id) : null,
        amount: plan.newAmount,
      },
      difference: plan.difference,
      outcome: fareOutcome(plan.difference),
    };
  }

  async requestChange(
    userId: string,
    bookingId: string,
    dto: ChangeFlightBookingDto,
    now: Date = new Date(),
  ) {
    if (dto.confirm !== true) {
      throw new BadRequestException(
        'Confirm the change after viewing the fare difference (confirm must be true)',
      );
    }
    const plan = await this.plan(userId, bookingId, dto, now);
    const { booking } = plan;

    // Reserve the seats on the new flight(s) first (atomic, never oversells).
    const held: FlightLean[] = [];
    try {
      for (const leg of plan.legs.filter((l) => l.changed)) {
        const ok = await this.bookingsService.holdSeats(
          String(leg.flight._id),
          booking.cabinClass,
          plan.seats,
        );
        if (!ok) {
          throw new ConflictException(
            'Not enough seats available on the new flight in this cabin',
          );
        }
        held.push(leg.flight);
      }

      const change = await this.createChange(plan, now);
      if (plan.difference > 0) {
        return await this.startPayment(plan, change);
      }
      return await this.completeWithoutPayment(plan, change, now);
    } catch (error) {
      // Nothing was changed: give back the seats that were reserved.
      for (const flight of held) {
        await this.bookingsService.releaseSeats(
          String(flight._id),
          booking.cabinClass,
          plan.seats,
        );
      }
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          'This booking already has a change waiting for payment',
        );
      }
      throw error;
    }
  }

  /** Status of one change request (for the user to follow up after paying). */
  async getChange(userId: string, bookingId: string, changeId: string) {
    if (
      !Types.ObjectId.isValid(bookingId) ||
      !Types.ObjectId.isValid(changeId)
    ) {
      throw new BadRequestException('Invalid ID');
    }
    const change = await this.changeModel.findOne({
      _id: new Types.ObjectId(changeId),
      booking: new Types.ObjectId(bookingId),
      user: new Types.ObjectId(userId),
    });
    if (!change) {
      throw new NotFoundException('Change not found');
    }
    return this.toResponse(change);
  }

  /**
   * Called by the Stripe webhook (PAY-01) once the fare difference was paid. The change is applied
   * only if the amount is right and the 10-minute hold has not ended; otherwise the payment is returned.
   */
  async onFarePaid(event: FarePaidEvent): Promise<void> {
    if (!Types.ObjectId.isValid(event.changeId)) return;
    const change = await this.changeModel.findById(event.changeId);
    if (!change || change.status !== FlightChangeStatus.PENDING_PAYMENT) {
      // Already handled (re-sent event), or expired: money taken for an expired change goes back.
      if (change?.status === FlightChangeStatus.EXPIRED) {
        await this.refundPayment(
          change,
          event.amountReceived,
          'change expired',
        );
      }
      return;
    }
    if (change.stripePaymentIntentId !== event.paymentIntentId) return;

    const amountMatches =
      Math.round(event.amountReceived * 100) ===
      Math.round(change.difference * 100);
    if (!amountMatches || event.paidAt > change.expiresAt) {
      await this.failChange(
        change,
        amountMatches ? 'Paid after the hold ended' : 'Amount mismatch',
        event.amountReceived,
      );
      return;
    }
    const applied = await this.applyChange(change);
    if (applied === 'booking-changed') {
      await this.abandon(change, event.amountReceived, 'booking changed');
    }
  }

  /** Unpaid changes lose their seat hold after 10 minutes, like a booking hold (FLT-22). */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleChanges(): Promise<void> {
    const stale = await this.changeModel
      .find({
        status: FlightChangeStatus.PENDING_PAYMENT,
        expiresAt: { $lte: new Date() },
      })
      .limit(100);

    for (const change of stale) {
      try {
        if (
          change.stripePaymentIntentId &&
          !(await this.paymentsService.cancelFarePayment(
            change.stripePaymentIntentId,
          ))
        ) {
          continue; // money is moving: the webhook decides
        }
        const claimed = await this.changeModel.findOneAndUpdate(
          { _id: change._id, status: FlightChangeStatus.PENDING_PAYMENT },
          { $set: { status: FlightChangeStatus.EXPIRED } },
        );
        if (!claimed) continue;
        await this.releaseNewSeats(change);
      } catch (error) {
        this.logger.error(
          `Could not expire flight change ${String(change._id)}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  // ---------------------------------------------------------------------

  private async startPayment(plan: Plan, change: FlightChangeDocument) {
    try {
      const { paymentIntentId, clientSecret } =
        await this.paymentsService.createFarePayment({
          amount: plan.difference,
          changeId: String(change._id),
          bookingId: String(plan.booking._id),
        });
      change.stripePaymentIntentId = paymentIntentId;
      await change.save();
      return {
        ...this.toResponse(change),
        amountDue: plan.difference,
        clientSecret,
      };
    } catch (error) {
      // No payment could be started: drop the request (the seats are released by the caller).
      await this.changeModel.deleteOne({
        _id: change._id,
        status: FlightChangeStatus.PENDING_PAYMENT,
      });
      throw error;
    }
  }

  private async completeWithoutPayment(
    plan: Plan,
    change: FlightChangeDocument,
    now: Date,
  ) {
    const applied = await this.applyChange(change, now);
    if (applied === 'booking-changed') {
      throw new ConflictException(
        'The booking was changed or cancelled meanwhile, please try again',
      );
    }
    let refund: Awaited<
      ReturnType<RefundsService['issueFareDifferenceRefund']>
    > = null;
    let warning: string | undefined;
    if (plan.difference < 0) {
      try {
        refund = await this.refundsService.issueFareDifferenceRefund({
          bookingId: plan.booking._id as Types.ObjectId,
          amount: -plan.difference,
          reason: 'Flight changed to a cheaper fare',
          appliedPolicy: {
            source: 'FLT-27 fare difference',
            oldAmount: plan.currentAmount,
            newAmount: plan.newAmount,
          },
        });
      } catch (error) {
        this.logger.error(
          `Booking ${String(plan.booking._id)} changed but the refund failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        warning =
          'The flight was changed but the refund of the lower fare could not be created automatically. Please contact support.';
      }
    }
    return {
      // applyChange completed the request in the database, but this in-memory
      // document is still the PENDING_PAYMENT one created a moment ago.
      ...this.toResponse(change),
      status: FlightChangeStatus.COMPLETED,
      refund: refund
        ? {
            id: refund.id,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status,
          }
        : null,
      ...(warning ? { warning } : {}),
    };
  }

  /**
   * Applies a paid (or free) change: one atomic claim of the request, one atomic update of the booking,
   * then the seats move from the old to the new flight(s). Returns 'booking-changed' when the booking
   * is no longer in the state the change was made for.
   */
  private async applyChange(
    change: FlightChangeDocument,
    now: Date = new Date(),
  ): Promise<'applied' | 'already-handled' | 'booking-changed'> {
    const claimed = await this.changeModel.findOneAndUpdate(
      { _id: change._id, status: FlightChangeStatus.PENDING_PAYMENT },
      { $set: { status: FlightChangeStatus.COMPLETED, completedAt: now } },
      { returnDocument: 'after' },
    );
    if (!claimed) return 'already-handled';

    const bookingFilter: Record<string, unknown> = {
      _id: change.booking,
      user: change.user,
      status: FlightBookingStatus.CONFIRMED,
      outboundFlight: change.oldOutboundFlight,
    };
    if (change.oldReturnFlight)
      bookingFilter.returnFlight = change.oldReturnFlight;

    const update: Record<string, unknown> = {
      outboundFlight: change.newOutboundFlight,
      totalPrice: change.newTotalPrice,
      baggageFees: change.newBaggageFees,
    };
    if (change.newReturnFlight) update.returnFlight = change.newReturnFlight;

    const updated = await this.bookingModel.findOneAndUpdate(
      bookingFilter,
      { $set: update },
      { returnDocument: 'after' },
    );
    if (!updated) {
      await this.changeModel.updateOne(
        { _id: change._id },
        {
          $set: {
            status: FlightChangeStatus.FAILED,
            failureReason: 'The booking was changed or cancelled meanwhile',
          },
          $unset: { completedAt: 1 },
        },
      );
      return 'booking-changed';
    }

    await this.moveSeats(change);
    await this.notifyChanged(change, updated.bookingReference);
    return 'applied';
  }

  /** Old seats go back to the inventory, the held seats of the new flights become booked. */
  private async moveSeats(change: FlightChangeLike): Promise<void> {
    const pairs: Array<[Types.ObjectId, Types.ObjectId]> = [
      [change.oldOutboundFlight, change.newOutboundFlight],
    ];
    if (change.oldReturnFlight && change.newReturnFlight) {
      pairs.push([change.oldReturnFlight, change.newReturnFlight]);
    }
    const seats = change.seats;
    for (const [oldId, newId] of pairs) {
      if (oldId.equals(newId)) continue;
      const released = await this.flightModel.updateOne(
        { _id: oldId },
        { $inc: { 'cabins.$[c].bookedSeats': -seats } },
        {
          arrayFilters: [
            {
              'c.cabinClass': change.cabinClass,
              'c.bookedSeats': { $gte: seats },
            },
          ],
        },
      );
      const booked = await this.flightModel.updateOne(
        { _id: newId },
        {
          $inc: {
            'cabins.$[c].heldSeats': -seats,
            'cabins.$[c].bookedSeats': seats,
          },
        },
        {
          arrayFilters: [
            {
              'c.cabinClass': change.cabinClass,
              'c.heldSeats': { $gte: seats },
            },
          ],
        },
      );
      if (released.modifiedCount !== 1 || booked.modifiedCount !== 1) {
        this.logger.error(
          `Flight change ${String(change._id)}: ${seats} seat(s) could not be moved from flight ${String(oldId)} to ${String(newId)}`,
        );
      }
    }
  }

  /** Releases the seats that were held for a change that did not happen. */
  private async releaseNewSeats(change: FlightChangeLike): Promise<void> {
    const ids: Types.ObjectId[] = [];
    if (!change.oldOutboundFlight.equals(change.newOutboundFlight)) {
      ids.push(change.newOutboundFlight);
    }
    if (
      change.oldReturnFlight &&
      change.newReturnFlight &&
      !change.oldReturnFlight.equals(change.newReturnFlight)
    ) {
      ids.push(change.newReturnFlight);
    }
    for (const id of ids) {
      await this.bookingsService.releaseSeats(
        String(id),
        change.cabinClass,
        change.seats,
      );
    }
  }

  /** Paid but not applicable: mark it FAILED, then give the seats and the money back. */
  private async failChange(
    change: FlightChangeLike,
    reason: string,
    amountReceived: number,
  ): Promise<void> {
    const failed = await this.changeModel.findOneAndUpdate(
      { _id: change._id, status: FlightChangeStatus.PENDING_PAYMENT },
      { $set: { status: FlightChangeStatus.FAILED, failureReason: reason } },
    );
    if (!failed) return;
    await this.abandon(change, amountReceived, reason);
  }

  /** The change will not happen: release its seats and return what the user paid. */
  private async abandon(
    change: FlightChangeLike,
    amountReceived: number,
    reason: string,
  ): Promise<void> {
    await this.releaseNewSeats(change);
    await this.refundPayment(change, amountReceived, reason);
  }

  private async refundPayment(
    change: FlightChangeLike,
    amount: number,
    reason: string,
  ): Promise<void> {
    if (!change.stripePaymentIntentId || amount <= 0) return;
    try {
      await this.paymentsService.refundFarePayment(
        change.stripePaymentIntentId,
        amount,
        String(change._id),
      );
    } catch (error) {
      this.logger.error(
        `Flight change ${String(change._id)} (${reason}): the payment of ${amount} could not be refunded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async createChange(plan: Plan, now: Date) {
    const { booking } = plan;
    return this.changeModel.create({
      booking: booking._id as Types.ObjectId,
      user: booking.user,
      oldOutboundFlight: booking.outboundFlight,
      oldReturnFlight: booking.returnFlight,
      newOutboundFlight: plan.legs[0].flight._id,
      newReturnFlight: plan.legs[1]?.flight._id,
      cabinClass: booking.cabinClass,
      seats: plan.seats,
      oldAmount: plan.currentAmount,
      newAmount: plan.newAmount,
      newTotalPrice: plan.newTotalPrice,
      newBaggageFees: plan.newBaggageFees,
      difference: plan.difference,
      status: FlightChangeStatus.PENDING_PAYMENT,
      expiresAt: new Date(now.getTime() + CHANGE_HOLD_MS),
    });
  }

  /**
   * Checks everything and prices the new flights. Nothing is written here, so
   * the quote and the real change always agree.
   */
  private async plan(
    userId: string,
    bookingId: string,
    input: ChangeFlightQueryDto,
    now: Date,
  ): Promise<Plan> {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }
    const booking = await this.bookingModel.findOne({
      _id: new Types.ObjectId(bookingId),
      user: new Types.ObjectId(userId),
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== FlightBookingStatus.CONFIRMED) {
      throw new ConflictException('Only a confirmed booking can be changed');
    }
    if (!booking.bookingReference) {
      throw new ConflictException(
        'Booking reference is not ready yet, try again shortly',
      );
    }
    if (!input.outboundFlightId && !input.returnFlightId) {
      throw new BadRequestException(
        'Choose the new outboundFlightId and/or returnFlightId',
      );
    }
    if (input.returnFlightId && !booking.returnFlight) {
      throw new BadRequestException(
        'This booking has no return flight to change',
      );
    }

    const currentOutbound = await this.loadFlight(booking.outboundFlight);
    if (hasDeparted(currentOutbound.departureTime, now)) {
      throw new ConflictException(
        'A booking cannot be changed after departure',
      );
    }
    const currentReturn = booking.returnFlight
      ? await this.loadFlight(booking.returnFlight)
      : undefined;

    const legs: PlannedLeg[] = [
      await this.planLeg(
        'OUTBOUND',
        currentOutbound,
        input.outboundFlightId,
        now,
      ),
    ];
    if (currentReturn) {
      legs.push(
        await this.planLeg('RETURN', currentReturn, input.returnFlightId, now),
      );
    }
    if (!legs.some((l) => l.changed)) {
      throw new BadRequestException(
        'Choose a different flight than the one already booked',
      );
    }
    if (legs[1]) {
      if (legs[0].flight._id.equals(legs[1].flight._id)) {
        throw new BadRequestException(
          'Return flight must be different from the outbound flight',
        );
      }
      if (legs[1].flight.departureTime <= legs[0].flight.arrivalTime) {
        throw new BadRequestException(
          'Return flight must depart after the outbound flight arrives',
        );
      }
    }

    // Price the whole booking again on the final flights (same rules as the hold, FLT-22 / FLT-19).
    const adults = booking.passengers.filter(
      (p) => p.type === PassengerType.ADULT,
    ).length;
    const children = booking.passengers.filter(
      (p) => p.type === PassengerType.CHILD,
    ).length;
    const infants = booking.passengers.filter(
      (p) => p.type === PassengerType.INFANT,
    ).length;
    const seats = adults + children;

    let fares = 0;
    let baggage = 0;
    for (const leg of legs) {
      const cabin = leg.flight.cabins.find(
        (c) => c.cabinClass === (booking.cabinClass as string),
      );
      if (!cabin) {
        throw new BadRequestException(
          `Flight ${leg.flight.flightNumber} has no ${booking.cabinClass} cabin`,
        );
      }
      fares += legFare(cabin.price, seats, infants);
      const airline = await this.airlineModel
        .findById(leg.flight.airline)
        .lean();
      try {
        baggage += calculateLegBaggageFees(
          booking.passengers,
          cabin,
          airline?.baggagePolicy,
        ).total;
      } catch (error) {
        if (error instanceof BaggageRuleError) {
          throw new BadRequestException(
            `Flight ${leg.flight.flightNumber}: ${error.message}`,
          );
        }
        throw error;
      }
    }

    const newTotalPrice = Math.round(fares * 100) / 100;
    const newBaggageFees = Math.round(baggage * 100) / 100;
    const currentAmount = chargeTotal(booking.totalPrice, booking.baggageFees);
    const newAmount = chargeTotal(newTotalPrice, newBaggageFees);

    return {
      booking,
      legs,
      seats,
      newTotalPrice,
      newBaggageFees,
      currentAmount,
      newAmount,
      difference: fareDifference(currentAmount, newAmount),
    };
  }

  /** Keeps the current flight, or checks the replacement: same route, still bookable, airline active. */
  private async planLeg(
    segment: PlannedLeg['segment'],
    current: FlightLean,
    newFlightId: string | undefined,
    now: Date,
  ): Promise<PlannedLeg> {
    if (!newFlightId || current._id.equals(new Types.ObjectId(newFlightId))) {
      if (newFlightId) {
        throw new BadRequestException(
          'Choose a different flight than the one already booked',
        );
      }
      return { segment, flight: current, changed: false };
    }
    const flight = await this.loadFlight(new Types.ObjectId(newFlightId));
    if (!isSameRoute(current, flight)) {
      throw new BadRequestException(
        `The new ${segment.toLowerCase()} flight must fly the same route as the booked one`,
      );
    }
    if (
      flight.status !== FlightStatus.SCHEDULED ||
      flight.departureTime <= now
    ) {
      throw new BadRequestException(
        `Flight ${flight.flightNumber} is not available for booking`,
      );
    }
    const airline = await this.airlineModel.findById(flight.airline).lean();
    if (airline?.isActive === false) {
      throw new BadRequestException(
        `Flight ${flight.flightNumber} is not available for booking`,
      );
    }
    return { segment, flight, changed: true };
  }

  private async loadFlight(id: Types.ObjectId): Promise<FlightLean> {
    const flight = await this.flightModel.findById(id).lean<FlightLean>();
    if (!flight) {
      throw new NotFoundException(`Flight ${String(id)} not found`);
    }
    return flight;
  }

  private async notifyChanged(
    change: FlightChangeLike,
    bookingReference: string | undefined,
  ): Promise<void> {
    try {
      const diff = change.difference;
      await this.notificationsService.create(change.user, {
        type: NotificationType.BOOKING_CHANGED,
        title: 'Flight booking changed',
        message:
          `Your flight booking ${bookingReference ?? String(change.booking)} was changed. ` +
          (diff > 0
            ? `You paid ${diff.toFixed(2)} USD more.`
            : diff < 0
              ? `${(-diff).toFixed(2)} USD is refunded to you.`
              : 'The price did not change.'),
        metadata: {
          bookingId: String(change.booking),
          bookingReference,
          changeId: String(change._id),
          difference: diff,
        },
      });
    } catch (error) {
      this.logger.error(
        `Booking ${String(change.booking)} changed but notification failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private toResponse(
    change: FlightChangeLike & { status: FlightChangeStatus },
  ) {
    return {
      changeId: String(change._id),
      bookingId: String(change.booking),
      status: change.status,
      newOutboundFlightId: String(change.newOutboundFlight),
      newReturnFlightId: change.newReturnFlight
        ? String(change.newReturnFlight)
        : null,
      oldAmount: change.oldAmount,
      newAmount: change.newAmount,
      difference: change.difference,
      currency: 'USD',
      expiresAt: change.expiresAt,
      ...(change.failureReason ? { failureReason: change.failureReason } : {}),
    };
  }
}

type FlightChangeLike = Pick<
  FlightChange,
  | 'oldOutboundFlight'
  | 'oldReturnFlight'
  | 'newOutboundFlight'
  | 'newReturnFlight'
  | 'cabinClass'
  | 'seats'
  | 'difference'
  | 'oldAmount'
  | 'newAmount'
  | 'user'
  | 'booking'
  | 'stripePaymentIntentId'
  | 'expiresAt'
  | 'failureReason'
> & { _id: Types.ObjectId };

interface Plan {
  booking: FlightBooking;
  legs: PlannedLeg[];
  seats: number;
  newTotalPrice: number;
  newBaggageFees: number;
  currentAmount: number;
  newAmount: number;
  difference: number;
}
