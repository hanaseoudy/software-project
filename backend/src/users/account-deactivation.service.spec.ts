import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AccountDeactivationService } from './account-deactivation.service';
import { AccountStatus, UserRole } from './schemas/user.schema';
import { HotelBookingStatus } from '../hotel-bookings/schemas/hotel-booking.schema';
import { FlightBookingStatus } from '../flight-bookings/schemas/flight-booking.schema';
import { ItineraryVisibility } from '../itineraries/schemas/itinerary.schema';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));

describe('AccountDeactivationService (ACC-12)', () => {
  const userModel = { findById: jest.fn(), updateOne: jest.fn() };
  const sessionModel = { updateMany: jest.fn() };
  const hotelBookingModel = { exists: jest.fn() };
  const flightBookingModel = { find: jest.fn() };
  const flightModel = { exists: jest.fn() };
  const itineraryModel = { updateMany: jest.fn() };
  const service = new AccountDeactivationService(
    userModel as any,
    sessionModel as any,
    hotelBookingModel as any,
    flightBookingModel as any,
    flightModel as any,
    itineraryModel as any,
  );

  const id = new Types.ObjectId();
  const flightId = new Types.ObjectId();
  const returnId = new Types.ObjectId();
  const account = (overrides: object = {}) => ({
    _id: id,
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    passwordHash: 'hash',
    ...overrides,
  });
  const withUser = (value: unknown) => userModel.findById.mockReturnValue({ select: () => Promise.resolve(value) });
  const withFlightBookings = (value: unknown[]) =>
    flightBookingModel.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(value) }) });

  beforeEach(() => {
    jest.resetAllMocks();
    withUser(account());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    hotelBookingModel.exists.mockResolvedValue(null);
    withFlightBookings([]);
    flightModel.exists.mockResolvedValue(null);
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it('deactivates the account, logs it out everywhere and hides its public itineraries', async () => {
    await expect(service.deactivate(id.toString(), { password: 'MyPass123' })).resolves.toEqual({
      message: 'Account deactivated',
    });
    expect(bcrypt.compare).toHaveBeenCalledWith('MyPass123', 'hash');
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: id, status: AccountStatus.ACTIVE },
      { $set: { status: AccountStatus.DEACTIVATED } },
    );
    expect(sessionModel.updateMany).toHaveBeenCalledWith(
      { user: id, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
    expect(itineraryModel.updateMany).toHaveBeenCalledWith(
      { userId: id, visibility: ItineraryVisibility.PUBLIC },
      { $set: { visibility: ItineraryVisibility.PRIVATE } },
    );
  });

  it('rejects a wrong password and changes nothing', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const error = await service.deactivate(id.toString(), { password: 'wrong' }).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({ message: 'Validation failed', errors: { password: ['Password is incorrect'] } });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('is blocked by a Confirmed hotel stay that has not ended', async () => {
    hotelBookingModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });
    await expect(service.deactivate(id.toString(), { password: 'MyPass123' })).rejects.toBeInstanceOf(ConflictException);
    expect(hotelBookingModel.exists).toHaveBeenCalledWith({
      user: id,
      status: HotelBookingStatus.CONFIRMED,
      checkOut: { $gt: expect.any(Date) },
    });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('is blocked by a Confirmed flight with a leg that has not departed', async () => {
    withFlightBookings([{ outboundFlight: flightId, returnFlight: returnId }]);
    flightModel.exists.mockResolvedValue({ _id: returnId });
    await expect(service.deactivate(id.toString(), { password: 'MyPass123' })).rejects.toBeInstanceOf(ConflictException);
    expect(flightBookingModel.find).toHaveBeenCalledWith({ user: id, status: FlightBookingStatus.CONFIRMED });
    expect(flightModel.exists).toHaveBeenCalledWith({
      _id: { $in: [flightId, returnId] },
      departureTime: { $gt: expect.any(Date) },
    });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('is allowed when all Confirmed flights have already departed', async () => {
    withFlightBookings([{ outboundFlight: flightId }]);
    await expect(service.deactivate(id.toString(), { password: 'MyPass123' })).resolves.toEqual({
      message: 'Account deactivated',
    });
  });

  it.each([UserRole.ADMIN, UserRole.MODERATOR])('refuses a %s account', async (role) => {
    withUser(account({ role }));
    await expect(service.deactivate(id.toString(), { password: 'MyPass123' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('returns 401 when the account is missing or no longer active', async () => {
    withUser(null);
    await expect(service.deactivate(id.toString(), { password: 'x' })).rejects.toBeInstanceOf(UnauthorizedException);
    withUser(account({ status: AccountStatus.SUSPENDED }));
    await expect(service.deactivate(id.toString(), { password: 'x' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not log out or hide anything if the status changed at the same moment', async () => {
    userModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await expect(service.deactivate(id.toString(), { password: 'MyPass123' })).rejects.toBeInstanceOf(ConflictException);
    expect(sessionModel.updateMany).not.toHaveBeenCalled();
    expect(itineraryModel.updateMany).not.toHaveBeenCalled();
  });
});