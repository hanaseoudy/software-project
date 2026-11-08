import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoomAvailabilityDto } from './create-room-availability.dto';

const failing = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(CreateRoomAvailabilityDto, body))).map(
    (e) => e.property,
  );

describe('CreateRoomAvailabilityDto', () => {
  it('accepts YYYY-MM-DD dates', async () => {
    expect(
      await failing({ startDate: '2026-12-01', endDate: '2026-12-31' }),
    ).toEqual([]);
  });

  it.each(['2026-1-01', '01-12-2026', '2026/12/01', 'tomorrow', ''])(
    'rejects "%s" as a start date',
    async (value) => {
      expect(
        await failing({ startDate: value, endDate: '2026-12-31' }),
      ).toEqual(['startDate']);
    },
  );

  it('reports both dates when they are missing', async () => {
    expect((await failing({})).sort()).toEqual(['endDate', 'startDate']);
  });
});
