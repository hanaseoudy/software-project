import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { CreateItineraryBookingLinkDto } from './create-itinerary-booking-link.dto';
describe('ITN-27 request DTO', () => {
  const id = new Types.ObjectId().toString(),
    valid = { bookingType: 'hotel', bookingId: id, dayIds: [id] };
  it.each(['flight', 'hotel'])('accepts %s references', async (bookingType) => {
    expect(
      await validate(
        plainToInstance(CreateItineraryBookingLinkDto, {
          ...valid,
          bookingType,
        }),
      ),
    ).toEqual([]);
  });
  it.each([
    { bookingType: 'other' },
    { bookingType: null },
    { bookingId: 'bad' },
    { bookingId: null },
    { dayIds: [] },
    { dayIds: [id, id] },
    { dayIds: ['bad'] },
    { dayIds: null },
    { dayIds: 'bad' },
    {
      dayIds: Array.from({ length: 61 }, () => new Types.ObjectId().toString()),
    },
  ])('rejects %j', async (change) => {
    expect(
      (
        await validate(
          plainToInstance(CreateItineraryBookingLinkDto, {
            ...valid,
            ...change,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
