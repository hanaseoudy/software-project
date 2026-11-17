import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AccountStatus, User, UserDocument, UserRole } from './schemas/user.schema';
import { Session, SessionDocument } from '../auth/schemas/session.schema';
import { HotelBooking, HotelBookingStatus } from '../hotel-bookings/schemas/hotel-booking.schema';
import { FlightBooking, FlightBookingStatus } from '../flight-bookings/schemas/flight-booking.schema';
import { Flight } from '../flights/schemas/flight.schema';
import { Itinerary, ItineraryVisibility } from '../itineraries/schemas/itinerary.schema';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';

/**
 * ACC-12: a registered user deactivates their own account.
 * - Login is refused for deactivated accounts (AuthService) and every session is revoked here.
 * - Posts of deactivated authors are hidden and their comments show "Deleted user" (BlogService).
 * - Hotel reviews show "Deleted user" (HotelsService).
 * - Public itineraries are made private here, so they are no longer visible to others.
 */
@Injectable()
export class AccountDeactivationService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(HotelBooking.name) private hotelBookingModel: Model<HotelBooking>,
    @InjectModel(FlightBooking.name) private flightBookingModel: Model<FlightBooking>,
    @InjectModel(Flight.name) private flightModel: Model<Flight>,
    @InjectModel(Itinerary.name) private itineraryModel: Model<Itinerary>,
  ) {}

  async deactivate(userId: string, dto: DeactivateAccountDto) {
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Not authenticated');
    }
    if (user.role !== UserRole.USER) {
      throw new ForbiddenException('Only registered users can deactivate their own account');
    }
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new BadRequestException({ message: 'Validation failed', errors: { password: ['Password is incorrect'] } });
    }

    if (await this.hasUpcomingConfirmedBookings(user._id)) {
      throw new ConflictException(
        'You have upcoming confirmed bookings. Cancel them or wait until they are completed before deactivating your account.',
      );
    }

    const result = await this.userModel.updateOne(
      { _id: user._id, status: AccountStatus.ACTIVE },
      { $set: { status: AccountStatus.DEACTIVATED } },
    );
    if (result.modifiedCount === 0) {
      throw new ConflictException('Account status changed, please try again');
    }

    await this.sessionModel.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await this.itineraryModel.updateMany(
      { userId: user._id, visibility: ItineraryVisibility.PUBLIC },
      { $set: { visibility: ItineraryVisibility.PRIVATE } },
    );

    return { message: 'Account deactivated' };
  }

  /** A Confirmed hotel stay that has not ended yet, or a Confirmed flight with a leg that has not departed yet. */
  private async hasUpcomingConfirmedBookings(userId: Types.ObjectId) {
    const now = new Date();

    const hotelStay = await this.hotelBookingModel.exists({
      user: userId,
      status: HotelBookingStatus.CONFIRMED,
      checkOut: { $gt: now },
    });
    if (hotelStay) {
      return true;
    }

    const flightBookings = await this.flightBookingModel
      .find({ user: userId, status: FlightBookingStatus.CONFIRMED })
      .select('outboundFlight returnFlight')
      .lean();
    const flightIds = flightBookings.flatMap((b) => (b.returnFlight ? [b.outboundFlight, b.returnFlight] : [b.outboundFlight]));
    if (flightIds.length === 0) {
      return false;
    }

    return !!(await this.flightModel.exists({ _id: { $in: flightIds }, departureTime: { $gt: now } }));
  }
}