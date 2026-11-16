import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RoomStatusQueryDto } from './room-status-query.dto';

const valid = { startDate: '2026-12-01', endDate: '2026-12-31' };

const failing = async (query: Record<string, unknown>) =>
  (await validate(plainToInstance(RoomStatusQueryDto, query))).map(
    (e) => e.property,
  );

describe('RoomStatusQueryDto', () => {
  it('accepts a start and an end date', async () => {
    expect(await failing(valid)).toEqual([]);
  });

  it('defaults the page to 1 and accepts a page given as text', async () => {
    expect(plainToInstance(RoomStatusQueryDto, valid).page).toBe(1);
    expect(await failing({ ...valid, page: '2' })).toEqual([]);
  });

  it('needs both dates', async () => {
    expect(await failing({})).toEqual(['startDate', 'endDate']);
  });

  it.each(['2026-12-1', '12/01/2026', '2026-12-01T10:00:00Z', 'today', ''])(
    'rejects the start date format "%s"',
    async (startDate) => {
      expect(await failing({ ...valid, startDate })).toEqual(['startDate']);
    },
  );

  it('rejects a wrong end date format', async () => {
    expect(await failing({ ...valid, endDate: '31-12-2026' })).toEqual([
      'endDate',
    ]);
  });

  it('rejects page 0 and a page that is not a number', async () => {
    expect(await failing({ ...valid, page: '0' })).toEqual(['page']);
    expect(await failing({ ...valid, page: 'x' })).toEqual(['page']);
  });
});
