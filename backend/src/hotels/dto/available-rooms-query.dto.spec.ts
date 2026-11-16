import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AvailableRoomsQueryDto } from './available-rooms-query.dto';

const valid = { checkIn: '2026-12-10', checkOut: '2026-12-14' };

const failing = async (query: Record<string, unknown>) =>
  (await validate(plainToInstance(AvailableRoomsQueryDto, query))).map(
    (e) => e.property,
  );

describe('AvailableRoomsQueryDto', () => {
  it('accepts check-in and check-out', async () => {
    expect(await failing(valid)).toEqual([]);
  });

  it('defaults the page to 1 and accepts a page given as text', async () => {
    expect(plainToInstance(AvailableRoomsQueryDto, valid).page).toBe(1);
    expect(await failing({ ...valid, page: '2' })).toEqual([]);
  });

  it('needs check-in and check-out', async () => {
    expect(await failing({})).toEqual(['checkIn', 'checkOut']);
  });

  it.each(['2026-12-1', '12/10/2026', '2026-12-10T10:00:00Z', 'tomorrow', ''])(
    'rejects the check-in format "%s"',
    async (checkIn) => {
      expect(await failing({ ...valid, checkIn })).toEqual(['checkIn']);
    },
  );

  it('rejects a wrong check-out format', async () => {
    expect(await failing({ ...valid, checkOut: '14-12-2026' })).toEqual([
      'checkOut',
    ]);
  });

  it('rejects page 0 and a page that is not a number', async () => {
    expect(await failing({ ...valid, page: '0' })).toEqual(['page']);
    expect(await failing({ ...valid, page: 'x' })).toEqual(['page']);
  });
});
