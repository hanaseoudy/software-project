import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { AccountStatus, SupportedCurrency, UserRole } from './schemas/user.schema';

describe('UsersService (ACC-09)', () => {
  const userModel = { findById: jest.fn(), findOneAndUpdate: jest.fn() };
  const service = new UsersService(userModel as any);

  const userId = new Types.ObjectId();
  const user = (overrides: object = {}) => ({
    _id: userId,
    firstName: 'Nour',
    lastName: 'Hossam',
    email: 'nour@example.com',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    preferences: { currency: SupportedCurrency.EGP },
    passwordHash: 'secret-hash',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    userModel.findById.mockResolvedValue(user());
    userModel.findOneAndUpdate.mockResolvedValue(user());
  });

  describe('getProfile', () => {
    it('returns the profile without the password', async () => {
      const profile = await service.getProfile(userId.toString());

      expect(profile).toEqual({
        id: userId,
        firstName: 'Nour',
        lastName: 'Hossam',
        email: 'nour@example.com',
        phoneNumber: null,
        role: UserRole.USER,
        preferredCurrency: SupportedCurrency.EGP,
      });
      expect(profile).not.toHaveProperty('passwordHash');
    });

    it('rejects a missing or inactive account with 401', async () => {
      userModel.findById.mockResolvedValue(null);
      await expect(service.getProfile(userId.toString())).rejects.toBeInstanceOf(UnauthorizedException);

      userModel.findById.mockResolvedValue(user({ status: AccountStatus.SUSPENDED }));
      await expect(service.getProfile(userId.toString())).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('updateProfile', () => {
    it('saves name, phone number and preferred currency together', async () => {
      userModel.findOneAndUpdate.mockResolvedValue(
        user({ firstName: 'Nourr', phoneNumber: '+201001234567', preferences: { currency: SupportedCurrency.USD } }),
      );

      const profile = await service.updateProfile(userId.toString(), {
        firstName: 'Nourr',
        lastName: 'Hossam',
        phoneNumber: '+201001234567',
        preferredCurrency: SupportedCurrency.USD,
      });

      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: userId.toString(), status: AccountStatus.ACTIVE },
        {
          $set: {
            firstName: 'Nourr',
            lastName: 'Hossam',
            phoneNumber: '+201001234567',
            'preferences.currency': SupportedCurrency.USD,
          },
        },
        { returnDocument: 'after', runValidators: true },
      );
      expect(profile).toMatchObject({
        firstName: 'Nourr',
        phoneNumber: '+201001234567',
        preferredCurrency: SupportedCurrency.USD,
      });
    });

    it('only changes the fields that were sent', async () => {
      await service.updateProfile(userId.toString(), { preferredCurrency: SupportedCurrency.EUR });

      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { $set: { 'preferences.currency': SupportedCurrency.EUR } },
        expect.anything(),
      );
    });

    it('removes the phone number when null is sent', async () => {
      await service.updateProfile(userId.toString(), { phoneNumber: null });

      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { $unset: { phoneNumber: '' } },
        expect.anything(),
      );
    });

    it('rejects a body with no editable field and saves nothing', async () => {
      const error = await service.updateProfile(userId.toString(), {}).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toEqual({
        message: 'Validation failed',
        errors: { body: ['Send at least one of firstName, lastName, phoneNumber, preferredCurrency'] },
      });
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects a missing or inactive account with 401', async () => {
      userModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.updateProfile(userId.toString(), { firstName: 'Nour' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});