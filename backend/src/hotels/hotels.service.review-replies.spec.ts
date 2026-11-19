import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import { UploadsService } from '../uploads/uploads.service';
import { ModeratorAssignment } from '../users/schemas/moderatorassignment.schema';
import { User } from '../users/schemas/user.schema';
import { HotelsService } from './hotels.service';
import { Hotel } from './schemas/hotel.schema';
import { RoomAvailability } from './schemas/room-availability.schema';
import { Room } from './schemas/room.schema';

const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
const found = (value: unknown) => {
  const chain: Record<string, unknown> = {};
  for (const name of ['sort', 'skip', 'limit', 'select', 'lean']) {
    chain[name] = jest.fn(() => chain);
  }
  chain.exec = () => Promise.resolve(value);
  return chain;
};

// HTL-26: the moderator's reply is shown with the review in HTL-24 and on the hotel details page
describe('HotelsService review replies (HTL-26)', () => {
  let service: HotelsService;
  const hotelModel = { findById: jest.fn() };
  const reviewModel = { find: jest.fn(), countDocuments: jest.fn() };
  const userModel = { find: jest.fn() };

  const hotelId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const repliedAt = new Date('2026-11-18T10:00:00.000Z');
  const review = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    user: userId,
    rating: 5,
    comment: 'Great stay',
    createdAt: new Date('2026-11-17T10:00:00.000Z'),
    updatedAt: new Date('2026-11-17T10:00:00.000Z'),
    ...over,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    hotelModel.findById.mockReturnValue(
      found({ _id: hotelId, isActive: true, averageRating: 5, reviewCount: 2 }),
    );
    reviewModel.countDocuments.mockReturnValue(execResult(2));
    userModel.find.mockReturnValue(found([{ _id: userId, firstName: 'Sara', lastName: 'Mohamed' }]));
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelsService,
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(Room.name), useValue: {} },
        { provide: getModelToken(RoomAvailability.name), useValue: {} },
        { provide: getModelToken(HotelBooking.name), useValue: {} },
        { provide: getModelToken(City.name), useValue: {} },
        { provide: getModelToken(Country.name), useValue: {} },
        { provide: getModelToken(ModeratorAssignment.name), useValue: {} },
        { provide: getModelToken(Review.name), useValue: reviewModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: UploadsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(HotelsService);
  });

  it('GET /hotels/:id/reviews returns the reply as { text, repliedAt } and null when there is none', async () => {
    reviewModel.find.mockReturnValue(
      found([
        review({ reply: { text: 'Thank you!', moderator: new Types.ObjectId(), repliedAt } }),
        review(),
      ]),
    );
    const result = await service.listReviews(hotelId.toString(), 1);

    expect(result.items[0].reply).toEqual({ text: 'Thank you!', repliedAt });
    expect(result.items[1].reply).toBeNull();
  });

  it('does not expose which moderator replied', async () => {
    reviewModel.find.mockReturnValue(
      found([review({ reply: { text: 'Thank you!', moderator: new Types.ObjectId(), repliedAt } })]),
    );
    const result = await service.listReviews(hotelId.toString(), 1);
    expect(Object.keys(result.items[0].reply!).sort()).toEqual(['repliedAt', 'text']);
  });

  it('asks the database for the reply field', async () => {
    const chain = found([review()]);
    reviewModel.find.mockReturnValue(chain);
    await service.listReviews(hotelId.toString(), 1);
    expect((chain.select as jest.Mock).mock.calls[0][0]).toContain('reply');
  });
});
