import { UsersController } from './users.controller';
import { SupportedCurrency } from './schemas/user.schema';

describe('UsersController (ACC-09)', () => {
  const usersService = { getProfile: jest.fn(), updateProfile: jest.fn() };
  const controller = new UsersController(usersService as any);
  const user = { sub: '6aef52048e9d356647b49fdc', role: 'user', sid: 'session-id' };

  beforeEach(() => jest.resetAllMocks());

  it('reads the profile of the logged-in user', async () => {
    usersService.getProfile.mockResolvedValue({ firstName: 'Nour' });

    await expect(controller.getProfile(user)).resolves.toEqual({ firstName: 'Nour' });
    expect(usersService.getProfile).toHaveBeenCalledWith(user.sub);
  });

  it('updates the profile of the logged-in user only', async () => {
    const dto = { preferredCurrency: SupportedCurrency.USD };
    usersService.updateProfile.mockResolvedValue({ preferredCurrency: 'USD' });

    await expect(controller.updateProfile(user, dto)).resolves.toEqual({ preferredCurrency: 'USD' });
    expect(usersService.updateProfile).toHaveBeenCalledWith(user.sub, dto);
  });
});