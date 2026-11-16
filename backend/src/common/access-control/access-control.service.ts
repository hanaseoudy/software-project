import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import type { AuthPayload } from '../guards/jwt-auth.guard';
import { UserRole } from '../../users/schemas/user.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentDocument,
  ProviderType,
} from '../../users/schemas/moderatorassignment.schema';
import { Flight, FlightDocument } from '../../flights/schemas/flight.schema';
import { ItineraryVisibility } from '../../itineraries/schemas/itinerary.schema';

type IdLike = Types.ObjectId | string | { _id: Types.ObjectId | string };

export interface HotelBookingAccess {
  user: IdLike;
  hotel: IdLike;
}

export interface FlightBookingAccess {
  user: IdLike;
  outboundFlight: IdLike;
  returnFlight?: IdLike | null;
}

export interface ItineraryAccess {
  userId: IdLike;
  visibility: ItineraryVisibility;
}

const idOf = (value: IdLike | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object' && '_id' in value) {
    return String(value._id);
  }
  return String(value);
};

const NO_MATCH = { _id: { $in: [] as Types.ObjectId[] } };

@Injectable()
export class AccessControlService {
  constructor(
    @InjectModel(ModeratorAssignment.name)
    private readonly assignmentModel: Model<ModeratorAssignmentDocument>,
    @InjectModel(Flight.name)
    private readonly flightModel: Model<FlightDocument>,
  ) {}

  async assertCanViewHotelBooking(user: AuthPayload, booking: HotelBookingAccess): Promise<void> {
    if (idOf(booking.user) === user.sub || user.role === UserRole.ADMIN) {
      return;
    }

    if (user.role === UserRole.MODERATOR) {
      const hotelId = await this.assignedProviderId(user, ProviderType.HOTEL);
      if (hotelId && hotelId.toString() === idOf(booking.hotel)) {
        return;
      }
    }

    throw new ForbiddenException('You cannot view this booking');
  }

  async assertCanViewFlightBooking(user: AuthPayload, booking: FlightBookingAccess): Promise<void> {
    if (idOf(booking.user) === user.sub || user.role === UserRole.ADMIN) {
      return;
    }

    if (user.role === UserRole.MODERATOR) {
      const airlineId = await this.assignedProviderId(user, ProviderType.AIRLINE);
      const flightIds = [idOf(booking.outboundFlight), idOf(booking.returnFlight)].filter(
        (id): id is string => id !== null && isValidObjectId(id),
      );
      if (airlineId && flightIds.length > 0) {
        const ownFlights = await this.flightModel
          .countDocuments({
            _id: { $in: flightIds.map((id) => new Types.ObjectId(id)) },
            airline: airlineId,
          })
          .exec();
        if (ownFlights > 0) {
          return;
        }
      }
    }

    throw new ForbiddenException('You cannot view this booking');
  }

  assertCanViewItinerary(userId: string, itinerary: ItineraryAccess): void {
    if (itinerary.visibility === ItineraryVisibility.PUBLIC || idOf(itinerary.userId) === userId) {
      return;
    }

    throw new ForbiddenException("You cannot view another user's itinerary");
  }

  async hotelBookingListFilter(user: AuthPayload): Promise<Record<string, unknown>> {
    if (user.role === UserRole.ADMIN) {
      return {};
    }

    if (user.role === UserRole.MODERATOR) {
      const hotelId = await this.assignedProviderId(user, ProviderType.HOTEL);
      return hotelId ? { hotel: hotelId } : NO_MATCH;
    }

    return isValidObjectId(user.sub) ? { user: new Types.ObjectId(user.sub) } : NO_MATCH;
  }

  async flightBookingListFilter(user: AuthPayload): Promise<Record<string, unknown>> {
    if (user.role === UserRole.ADMIN) {
      return {};
    }

    if (user.role === UserRole.MODERATOR) {
      const airlineId = await this.assignedProviderId(user, ProviderType.AIRLINE);
      if (!airlineId) {
        return NO_MATCH;
      }
      const flightIds = await this.flightModel.distinct('_id', { airline: airlineId }).exec();
      return { $or: [{ outboundFlight: { $in: flightIds } }, { returnFlight: { $in: flightIds } }] };
    }

    return isValidObjectId(user.sub) ? { user: new Types.ObjectId(user.sub) } : NO_MATCH;
  }

  private async assignedProviderId(user: AuthPayload, providerType: ProviderType): Promise<Types.ObjectId | null> {
    if (!isValidObjectId(user.sub)) {
      return null;
    }

    const assignment = await this.assignmentModel
      .findOne({ moderatorId: new Types.ObjectId(user.sub), providerType })
      .lean()
      .exec();

    return assignment ? assignment.providerId : null;
  }
}