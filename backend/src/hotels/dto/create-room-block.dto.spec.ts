import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoomBlockDto } from './create-room-block.dto';

const failing = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(CreateRoomBlockDto, body))).map(
    (e) => e.property,
  );

describe('CreateRoomBlockDto', () => {
  it('accepts YYYY-MM-DD dates without a reason', async () => {
    expect(
      await failing({ startDate: '2026-12-10', endDate: '2026-12-15' }),
    ).toEqual([]);
  });

  it('accepts a reason', async () => {
    expect(
      await failing({
        startDate: '2026-12-10',
        endDate: '2026-12-15',
        reason: 'Maintenance',
      }),
    ).toEqual([]);
  });

  it.each(['2026-1-01', '10-12-2026', '2026/12/10', 'tomorrow', ''])(
    'rejects "%s" as a start date',
    async (value) => {
      expect(
        await failing({ startDate: value, endDate: '2026-12-15' }),
      ).toEqual(['startDate']);
    },
  );

  it('reports both dates when they are missing', async () => {
    expect((await failing({})).sort()).toEqual(['endDate', 'startDate']);
  });

  it('rejects a reason longer than 200 characters', async () => {
    expect(
      await failing({
        startDate: '2026-12-10',
        endDate: '2026-12-15',
        reason: 'x'.repeat(201),
      }),
    ).toEqual(['reason']);
  });

  it('rejects a reason that is not text', async () => {
    expect(
      await failing({
        startDate: '2026-12-10',
        endDate: '2026-12-15',
        reason: 5,
      }),
    ).toEqual(['reason']);
  });
});
