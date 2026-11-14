import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UserRole } from '../../users/schemas/user.schema';
import { ProviderType } from '../../users/schemas/moderatorassignment.schema';
import { ItineraryVisibility } from '../../itineraries/schemas/itinerary.schema';
import { AccessControlService } from './access-control.service';

const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });

describe('AccessControlService (ACC-11)', () => {
  const ownerId = new Types.ObjectId();
  const otherUserId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const moderatorId = new Types.ObjectId();
  const hotelId = new Types.ObjectId();
  const otherHotelId = new Types.ObjectId();
  const airlineId = new Types.ObjectId();
  const flightId = new Types.ObjectId();

  const asUser = (id: Types.ObjectId, role: UserRole) => ({ sub: id.toString(), role, sid: 'session' });
  const owner = asUser(ownerId, UserRole.USER);
  const stranger = asUser(otherUserId, UserRole.USER);
  const admin = asUser(adminId, UserRole.ADMIN);
  const moderator = asUser(moderatorId, UserRole.MODERATOR);

  let assignment: { providerId: Types.ObjectId; providerType: ProviderType } | null;
  let ownFlightCount: number;
  const assignmentModel = { findOne: jest.fn() };
  const flightModel = { countDocuments: jest.fn(), distinct: jest.fn() };
  const service = new AccessControlService(assignmentModel as any, flightModel as any);

  beforeEach(() => {
    jest.clearAllMocks();
    assignment = null;
    ownFlightCount = 0;
    assignmentModel.findOne.mockImplementation((filter: { providerType: ProviderType }) => ({
      lean: () => execResult(assignment && assignment.providerType === filter.providerType ? assignment : null),
    }));
    flightModel.countDocuments.mockImplementation(() => execResult(ownFlightCount));
    flightModel.distinct.mockImplementation(() => execResult([flightId]));
  });

  describe('hotel bookings', () => {
    const booking = { user: ownerId, hotel: hotelId };

    it('allows the owner', async () => {
      await expect(service.assertCanViewHotelBooking(owner, booking)).resolves.toBeUndefined();
    });

    it('allows the owner when the user field is populated', async () => {
      await expect(
        service.assertCanViewHotelBooking(owner, { user: { _id: ownerId }, hotel: hotelId }),
      ).resolves.toBeUndefined();
    });

    it('allows an admin (ACC-17)', async () => {
      await expect(service.assertCanViewHotelBooking(admin, booking)).resolves.toBeUndefined();
    });

    it("allows the moderator of the booking's hotel (HTL-22)", async () => {
      assignment = { providerId: hotelId, providerType: ProviderType.HOTEL };
      await expect(service.assertCanViewHotelBooking(moderator, booking)).resolves.toBeUndefined();
    });

    it('rejects a moderator of a different hotel', async () => {
      assignment = { providerId: otherHotelId, providerType: ProviderType.HOTEL };
      await expect(service.assertCanViewHotelBooking(moderator, booking)).rejects.toThrow(ForbiddenException);
    });

    it('rejects an airline moderator', async () => {
      assignment = { providerId: hotelId, providerType: ProviderType.AIRLINE };
      await expect(service.assertCanViewHotelBooking(moderator, booking)).rejects.toThrow(ForbiddenException);
    });

    it('rejects another user', async () => {
      await expect(service.assertCanViewHotelBooking(stranger, booking)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('flight bookings', () => {
    const booking = { user: ownerId, outboundFlight: flightId };

    it('allows the owner and an admin', async () => {
      await expect(service.assertCanViewFlightBooking(owner, booking)).resolves.toBeUndefined();
      await expect(service.assertCanViewFlightBooking(admin, booking)).resolves.toBeUndefined();
    });

    it("allows the moderator of the flight's airline (FLT-29)", async () => {
      assignment = { providerId: airlineId, providerType: ProviderType.AIRLINE };
      ownFlightCount = 1;
      await expect(service.assertCanViewFlightBooking(moderator, booking)).resolves.toBeUndefined();
      expect(flightModel.countDocuments).toHaveBeenCalledWith({ _id: { $in: [flightId] }, airline: airlineId });
    });

    it('rejects a moderator of a different airline', async () => {
      assignment = { providerId: airlineId, providerType: ProviderType.AIRLINE };
      ownFlightCount = 0;
      await expect(service.assertCanViewFlightBooking(moderator, booking)).rejects.toThrow(ForbiddenException);
    });

    it('rejects another user', async () => {
      await expect(service.assertCanViewFlightBooking(stranger, booking)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('itineraries', () => {
    it('allows the owner of a private itinerary', () => {
      expect(() =>
        service.assertCanViewItinerary(ownerId.toString(), { userId: ownerId, visibility: ItineraryVisibility.PRIVATE }),
      ).not.toThrow();
    });

    it('rejects another user viewing a private itinerary', () => {
      expect(() =>
        service.assertCanViewItinerary(otherUserId.toString(), {
          userId: ownerId,
          visibility: ItineraryVisibility.PRIVATE,
        }),
      ).toThrow(ForbiddenException);
    });

    it('rejects an admin viewing a private itinerary', () => {
      expect(() =>
        service.assertCanViewItinerary(adminId.toString(), { userId: ownerId, visibility: ItineraryVisibility.PRIVATE }),
      ).toThrow(ForbiddenException);
    });

    it('allows anyone to view a public itinerary', () => {
      expect(() =>
        service.assertCanViewItinerary(otherUserId.toString(), { userId: ownerId, visibility: ItineraryVisibility.PUBLIC }),
      ).not.toThrow();
    });
  });

  describe('list filters', () => {
    it('limits a user to their own hotel and flight bookings', async () => {
      await expect(service.hotelBookingListFilter(owner)).resolves.toEqual({ user: ownerId });
      await expect(service.flightBookingListFilter(owner)).resolves.toEqual({ user: ownerId });
    });

    it('gives an admin every booking', async () => {
      await expect(service.hotelBookingListFilter(admin)).resolves.toEqual({});
      await expect(service.flightBookingListFilter(admin)).resolves.toEqual({});
    });

    it("limits a hotel moderator to their hotel's bookings", async () => {
      assignment = { providerId: hotelId, providerType: ProviderType.HOTEL };
      await expect(service.hotelBookingListFilter(moderator)).resolves.toEqual({ hotel: hotelId });
    });

    it("limits an airline moderator to bookings on their airline's flights", async () => {
      assignment = { providerId: airlineId, providerType: ProviderType.AIRLINE };
      await expect(service.flightBookingListFilter(moderator)).resolves.toEqual({
        $or: [{ outboundFlight: { $in: [flightId] } }, { returnFlight: { $in: [flightId] } }],
      });
      expect(flightModel.distinct).toHaveBeenCalledWith('_id', { airline: airlineId });
    });

    it('returns no bookings for a moderator without an assignment', async () => {
      await expect(service.hotelBookingListFilter(moderator)).resolves.toEqual({ _id: { $in: [] } });
      await expect(service.flightBookingListFilter(moderator)).resolves.toEqual({ _id: { $in: [] } });
    });
  });
});