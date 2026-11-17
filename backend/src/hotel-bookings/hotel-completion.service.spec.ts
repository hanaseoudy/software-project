jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Logger: class {
    log() {}
  },
}));
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_HOUR: '0 0-23/1 * * *' },
}));
jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => () => undefined,
  SchemaFactory: { createForClass: () => ({ index: () => undefined }) },
}));
jest.mock('./schemas/hotel-booking.schema', () => ({
  HotelBooking: { name: 'HotelBooking' },
  HotelBookingStatus: {
    PENDING_PAYMENT: 'PENDING_PAYMENT',
    CONFIRMED: 'CONFIRMED',
    COMPLETED: 'COMPLETED',
  },
}));

import { HotelCompletionService } from './hotel-completion.service';

describe('HotelCompletionService', () => {
  const now = new Date('2026-11-20T12:00:00Z');

  it('moves only CONFIRMED reservations whose check-out has passed to COMPLETED', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
    const service = new HotelCompletionService({ updateMany } as never);

    await expect(service.completeFinishedStays(now)).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      { status: 'CONFIRMED', checkOut: { $lte: now } },
      { $set: { status: 'COMPLETED' } },
    );
  });

  it('returns 0 when nothing is due', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const service = new HotelCompletionService({ updateMany } as never);
    await expect(service.completeFinishedStays(now)).resolves.toBe(0);
  });
});
