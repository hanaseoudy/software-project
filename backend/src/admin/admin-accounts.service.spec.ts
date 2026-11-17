import { Types } from 'mongoose';
import { AdminAccountsService } from './admin-accounts.service';
import { AccountStatus, UserRole } from '../users/schemas/user.schema';

describe('AdminAccountsService.listAccounts (ACC-14)', () => {
  const query = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn(),
  };
  const count = { exec: jest.fn() };
  const userModel = { find: jest.fn(), countDocuments: jest.fn() };
  const service = new AdminAccountsService(userModel as any);

  const createdAt = new Date('2026-11-10T09:30:00.000Z');
  const account = {
    _id: new Types.ObjectId(),
    firstName: 'Nour',
    lastName: 'Hossam',
    email: 'nour@example.com',
    role: UserRole.USER,
    status: AccountStatus.ACTIVE,
    createdAt,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    for (const step of ['sort', 'skip', 'limit', 'select', 'lean'] as const) {
      query[step].mockReturnValue(query);
    }
    query.exec.mockResolvedValue([account]);
    count.exec.mockResolvedValue(1);
    userModel.find.mockReturnValue(query);
    userModel.countDocuments.mockReturnValue(count);
  });

  it('returns the first page of all accounts, newest first, with the required columns', async () => {
    const result = await service.listAccounts({});

    expect(userModel.find).toHaveBeenCalledWith({});
    expect(userModel.countDocuments).toHaveBeenCalledWith({});
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.select).toHaveBeenCalledWith('firstName lastName email role status createdAt');
    expect(result).toEqual({
      items: [
        {
          id: account._id,
          firstName: 'Nour',
          lastName: 'Hossam',
          email: 'nour@example.com',
          role: UserRole.USER,
          status: AccountStatus.ACTIVE,
          registeredAt: createdAt,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
  });

  it('skips to the requested page', async () => {
    count.exec.mockResolvedValue(25);

    const result = await service.listAccounts({ page: 3 });

    expect(query.skip).toHaveBeenCalledWith(20);
    expect(result).toMatchObject({ page: 3, total: 25, totalPages: 3 });
  });

  it('filters by role and status', async () => {
    await service.listAccounts({ role: UserRole.MODERATOR, status: AccountStatus.SUSPENDED });

    const filter = { role: UserRole.MODERATOR, status: AccountStatus.SUSPENDED };
    expect(userModel.find).toHaveBeenCalledWith(filter);
    expect(userModel.countDocuments).toHaveBeenCalledWith(filter);
  });

  it('searches first name, last name and email, case-insensitive', async () => {
    await service.listAccounts({ search: 'NOUR' });

    const pattern = /NOUR/i;
    expect(userModel.find).toHaveBeenCalledWith({
      $and: [{ $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }] }],
    });
  });

  it('requires every word of a full-name search to match', async () => {
    await service.listAccounts({ search: 'nour  hossam' });

    const filter = userModel.find.mock.calls[0][0];
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[1]).toEqual({ $or: [{ firstName: /hossam/i }, { lastName: /hossam/i }, { email: /hossam/i }] });
  });

  it('treats special characters in the search as plain text', async () => {
    await service.listAccounts({ search: 'a.b+c@x.com' });

    const pattern: RegExp = userModel.find.mock.calls[0][0].$and[0].$or[0].firstName;
    expect(pattern.test('a.b+c@x.com')).toBe(true);
    expect(pattern.test('aXbbbc@xYcom')).toBe(false);
  });

  it('combines search with role and status filters', async () => {
    await service.listAccounts({ search: 'sara', role: UserRole.MODERATOR, status: AccountStatus.ACTIVE });

    expect(userModel.find).toHaveBeenCalledWith({
      role: UserRole.MODERATOR,
      status: AccountStatus.ACTIVE,
      $and: [{ $or: [{ firstName: /sara/i }, { lastName: /sara/i }, { email: /sara/i }] }],
    });
  });

  it('ignores an empty search', async () => {
    await service.listAccounts({ search: '' });

    expect(userModel.find).toHaveBeenCalledWith({});
  });
});