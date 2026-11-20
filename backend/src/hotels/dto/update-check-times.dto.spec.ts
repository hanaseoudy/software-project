import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCheckTimesDto } from './update-check-times.dto';

const check = async (body: Record<string, unknown>) =>
  validate(plainToInstance(UpdateCheckTimesDto, body));

describe('UpdateCheckTimesDto', () => {
  it('accepts valid HH:mm times', async () => {
    expect(
      await check({ checkInTime: '14:00', checkOutTime: '12:00' }),
    ).toEqual([]);
    expect(
      await check({ checkInTime: '00:00', checkOutTime: '23:59' }),
    ).toEqual([]);
  });

  it.each(['24:00', '12:60', '9:00', '12-00', 'noon', ''])(
    'rejects "%s" as a check-in time',
    async (value) => {
      const errors = await check({ checkInTime: value, checkOutTime: '12:00' });
      expect(errors.map((e) => e.property)).toEqual(['checkInTime']);
    },
  );

  it('rejects missing times', async () => {
    const errors = await check({});
    expect(errors.map((e) => e.property).sort()).toEqual([
      'checkInTime',
      'checkOutTime',
    ]);
  });
});
