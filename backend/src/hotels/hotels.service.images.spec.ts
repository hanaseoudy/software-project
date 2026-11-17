import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { City } from '../reference-data/schemas/city.schema';
import { Country } from '../reference-data/schemas/country.schema';
import { ImageCategory } from '../uploads/uploads.constants';
import { UploadsService } from '../uploads/uploads.service';
import { ModeratorAssignment } from '../users/schemas/moderatorassignment.schema';
import { User, UserRole } from '../users/schemas/user.schema';
import { HotelsService } from './hotels.service';
import { Hotel } from './schemas/hotel.schema';
import { Room } from './schemas/room.schema';
import { RoomAvailability } from './schemas/room-availability.schema';

const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });

describe('HotelsService.addImages (HTL-01 / GEN-08)', () => {
  let service: HotelsService;
  const hotelId = new Types.ObjectId();
  const moderator = { sub: new Types.ObjectId().toString(), role: UserRole.MODERATOR, sid: 's' };
  const files = [{ originalname: 'a.jpg', mimetype: 'image/jpeg', size: 10, buffer: Buffer.from('x') }];

  const hotelModel = { findById: jest.fn(), updateOne: jest.fn() };
  const assignmentModel = { exists: jest.fn() };
  const uploads = { saveForOwner: jest.fn(), deleteByUrl: jest.fn() };

  const hotelDoc = (images: string[]) => ({
    _id: hotelId,
    name: 'Nile Palace',
    description: '',
    address: '1 Corniche',
    city: new Types.ObjectId(),
    country: new Types.ObjectId(),
    starRating: 5,
    amenities: [],
    images,
    checkInTime: '14:00',
    checkOutTime: '12:00',
    averageRating: 0,
    reviewCount: 0,
    isActive: true,
  });
  const run = () => service.addImages(hotelId.toString(), files, moderator as never);

  beforeEach(async () => {
    jest.resetAllMocks();
    hotelModel.findById.mockReturnValue(execResult(hotelDoc([])));
    assignmentModel.exists.mockReturnValue(execResult({ _id: 'a' }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelsService,
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(Room.name), useValue: {} },
        { provide: getModelToken(RoomAvailability.name), useValue: {} },
        { provide: getModelToken(HotelBooking.name), useValue: {} },
        { provide: getModelToken(City.name), useValue: {} },
        { provide: getModelToken(Country.name), useValue: {} },
        { provide: getModelToken(ModeratorAssignment.name), useValue: assignmentModel },
        { provide: getModelToken(Review.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: UploadsService, useValue: uploads },
      ],
    }).compile();
    service = moduleRef.get(HotelsService);
  });

  it('returns 404 when the hotel does not exist', async () => {
    hotelModel.findById.mockReturnValue(execResult(null));
    await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    expect(uploads.saveForOwner).not.toHaveBeenCalled();
  });

  it('returns 403 and stores nothing when the moderator is not assigned to the hotel', async () => {
    assignmentModel.exists.mockReturnValue(execResult(null));
    await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(uploads.saveForOwner).not.toHaveBeenCalled();
  });

  it('stores the files with the hotel category and its current images, then saves the new urls', async () => {
    const existing = ['/api/uploads/hotel/old.jpg'];
    const added = ['/api/uploads/hotel/new.jpg'];
    hotelModel.findById
      .mockReturnValueOnce(execResult(hotelDoc(existing)))
      .mockReturnValueOnce(execResult(hotelDoc([...existing, ...added])));
    uploads.saveForOwner.mockResolvedValue(added);
    hotelModel.updateOne.mockReturnValue(execResult({ modifiedCount: 1 }));

    const result = await run();

    expect(uploads.saveForOwner).toHaveBeenCalledWith(files, ImageCategory.HOTEL, existing);
    expect(hotelModel.updateOne).toHaveBeenCalledWith(
      { _id: hotelId, 'images.4': { $exists: false } },
      { $push: { images: { $each: added } } },
    );
    expect(result.images).toEqual([...existing, ...added]);
  });

  it('passes through the upload service errors (no file, bad image, more than 5 photos)', async () => {
    uploads.saveForOwner.mockRejectedValue(new BadRequestException('A hotel can have at most 5 image(s)'));
    await expect(run()).rejects.toBeInstanceOf(BadRequestException);
    expect(hotelModel.updateOne).not.toHaveBeenCalled();
  });

  it('deletes the stored files and returns 400 when a parallel upload already filled the hotel', async () => {
    const added = ['/api/uploads/hotel/a.jpg', '/api/uploads/hotel/b.jpg'];
    uploads.saveForOwner.mockResolvedValue(added);
    hotelModel.updateOne.mockReturnValue(execResult({ modifiedCount: 0 }));
    uploads.deleteByUrl.mockResolvedValue(undefined);

    await expect(run()).rejects.toBeInstanceOf(BadRequestException);
    expect(hotelModel.updateOne).toHaveBeenCalledWith(
      { _id: hotelId, 'images.3': { $exists: false } },
      expect.anything(),
    );
    expect(uploads.deleteByUrl).toHaveBeenCalledTimes(2);
  });
});
