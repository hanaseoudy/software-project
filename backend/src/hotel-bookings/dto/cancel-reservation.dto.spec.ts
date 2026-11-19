import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelReservationDto } from './cancel-reservation.dto';

const messages = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(CancelReservationDto, body))).flatMap((e) => Object.values(e.constraints ?? {}));

describe('CancelReservationDto (HTL-21)', () => {
  it.each([0, 330, 12.5, '330'])('accepts %p', async (value) => {
    expect(await messages({ expectedRefundAmount: value })).toEqual([]);
  });

  it.each([undefined, -1, 'abc', '', null, NaN])('rejects %p with a field-level message', async (value) => {
    expect(await messages({ expectedRefundAmount: value })).toEqual([
      'Expected refund amount must be a number of 0 or more (use the amount shown by the cancellation quote)',
    ]);
  });
});
