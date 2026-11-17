import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PassengerDto } from './hold-flight-booking.dto';

const check = async (dateOfBirth: string) => {
  const dto = plainToInstance(PassengerDto, { dateOfBirth });
  return (await validate(dto)).filter((e) => e.property === 'dateOfBirth');
};

describe('PassengerDto dateOfBirth (FLT-19)', () => {
  it.each(['2000-02-30', '2001-02-29', '2000-13-01', '2000-04-31'])('rejects the impossible date %s', async (value) => {
    expect(await check(value)).toHaveLength(1);
  });

  it('rejects a date in the future and values that are not YYYY-MM-DD', async () => {
    expect(await check('2999-01-01')).toHaveLength(1);
    expect(await check('2000-02-30T00:00:00Z')).toHaveLength(1);
    expect(await check('not a date')).toHaveLength(1);
  });

  it.each(['2000-02-29', '2002-05-20'])('accepts the real past date %s', async (value) => {
    expect(await check(value)).toHaveLength(0);
  });
});
