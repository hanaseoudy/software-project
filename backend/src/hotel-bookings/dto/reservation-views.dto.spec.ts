import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  HotelReservationsQueryDto,
  MyReservationsQueryDto,
} from './reservation-views.dto';

const messages = async <T extends object>(cls: new () => T, query: Record<string, unknown>) =>
  (await validate(plainToInstance(cls, query))).flatMap((e) => Object.values(e.constraints ?? {}));

describe('reservation query DTOs (HTL-20 / HTL-22)', () => {
  it('defaults the guest list to the upcoming group on page 1', () => {
    const dto = plainToInstance(MyReservationsQueryDto, {});
    expect(dto.group).toBe('upcoming');
    expect(dto.page).toBe(1);
  });

  it.each(['upcoming', 'past', 'cancelled'])('accepts group %s', async (group) => {
    expect(await messages(MyReservationsQueryDto, { group, page: '2' })).toEqual([]);
  });

  it('rejects an unknown group with a field-level message', async () => {
    expect(await messages(MyReservationsQueryDto, { group: 'old' })).toEqual([
      'Group must be upcoming, past or cancelled',
    ]);
  });

  it.each(['CONFIRMED', 'COMPLETED', 'CANCELLED'])('accepts moderator status %s', async (status) => {
    expect(await messages(HotelReservationsQueryDto, { status })).toEqual([]);
  });

  it('rejects other statuses, including unpaid ones', async () => {
    for (const status of ['PENDING_PAYMENT', 'EXPIRED', 'confirmed']) {
      expect(await messages(HotelReservationsQueryDto, { status })).toEqual([
        'Status must be CONFIRMED, COMPLETED or CANCELLED',
      ]);
    }
  });

  it('rejects a bad page number', async () => {
    expect(await messages(MyReservationsQueryDto, { page: '0' })).toEqual(['Page must be at least 1']);
  });
});
