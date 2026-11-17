import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAccountsQueryDto } from './list-accounts-query.dto';

const check = async (query: object) => {
  const dto = plainToInstance(ListAccountsQueryDto, query);
  const errors = await validate(dto);
  return { dto, errors: Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})])) };
};

describe('ListAccountsQueryDto (ACC-14)', () => {
  it('defaults to page 1 with no filters', async () => {
    const { dto, errors } = await check({});

    expect(errors).toEqual({});
    expect(dto.page).toBe(1);
  });

  it('accepts search, role, status and page together', async () => {
    const { dto, errors } = await check({ search: '  nour ', role: 'moderator', status: 'suspended', page: '2' });

    expect(errors).toEqual({});
    expect(dto.search).toBe('nour');
    expect(dto.page).toBe(2);
  });

  it('rejects an unknown role or status', async () => {
    const { errors } = await check({ role: 'superadmin', status: 'banned' });

    expect(errors.role).toContain('Role must be one of: user, moderator, admin');
    expect(errors.status).toContain('Status must be one of: active, suspended, deactivated');
  });

  it('rejects an invalid page', async () => {
    expect((await check({ page: '0' })).errors.page).toContain('Page must be at least 1');
  });

  it('rejects a search longer than 100 characters', async () => {
    expect((await check({ search: 'a'.repeat(101) })).errors.search).toContain('Search must be at most 100 characters');
  });
});