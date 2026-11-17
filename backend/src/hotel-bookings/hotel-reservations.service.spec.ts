import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { Room } from '../hotels/schemas/room.schema';
import { ModeratorAssignment } from '../users/schemas/moderatorassignment.schema';
import { User, UserRole } from '../users/schemas/user.schema';
import {
  ReservationGroup,
  ReservationViewStatus,
} from './dto/reservation-views.dto';
import { HotelReservationsService } from './hotel-reservations.service';
import { HotelBooking } from './schemas/hotel-booking.schema';

const execResult = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
// find() -> sort()/skip()/limit()/select()/lean() -> exec(), all returning the same value
const found = (value: unknown) => {
  const chain: Record<string, jest.Mock | (() => Promise<unknown>)> = {};
  for (const name of ['sort', 'skip', 'limit', 'select', 'lean']) {
    chain[name] = jest.fn(() => chain);
  }
  chain.exec = () => Promise.resolve(value);
  return chain;
};

const NOW = new Date('2026-12-01T10:00:00.000Z');
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('HotelReservationsService (HTL-20 / HTL-22)', () => {
  let service: HotelReservationsService;
  const bookingModel = { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn() };
  const hotelModel = { find: jest.fn(), findById: jest.fn() };
  const roomModel = { find: jest.fn() };
  const userModel = { find: jest.fn() };
  const assignmentModel = { exists: jest.fn() };

  const userId = new Types.ObjectId();
  const hotelId = new Types.ObjectId();
  const roomA = new Types.ObjectId();
  const roomB = new Types.ObjectId();

  const booking = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    bookingReference: 'HTL-AAAAAA',
    user: userId,
    hotel: hotelId,
    rooms: [
      { room: roomA, pricePerNight: 100, currency: 'USD', adults: 2, children: 1 },
      { room: roomB, pricePerNight: 120, currency: 'USD', adults: 1, children: 0 },
    ],
    checkIn: day('2026-12-20'),
    checkOut: day('2026-12-23'),
    totalPrice: 660,
    currency: 'USD',
    status: 'CONFIRMED',
    createdAt: new Date('2026-11-10T09:30:00.000Z'),
    policiesAcceptedAt: new Date('2026-11-10T09:31:00.000Z'),
    ...over,
  });

  const lookups = () => {
    hotelModel.find.mockReturnValue(
      found([{ _id: hotelId, name: 'Nile Palace', address: '1 Corniche' }]),
    );
    roomModel.find.mockReturnValue(
      found([
        { _id: roomA, roomNumber: '101', type: 'Deluxe' },
        { _id: roomB, roomNumber: '102', type: 'Standard' },
      ]),
    );
  };
  const counts = (upcoming = 0, past = 0, cancelled = 0) =>
    bookingModel.countDocuments
      .mockReturnValueOnce(execResult(upcoming))
      .mockReturnValueOnce(execResult(past))
      .mockReturnValueOnce(execResult(cancelled));

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HotelReservationsService,
        { provide: getModelToken(HotelBooking.name), useValue: bookingModel },
        { provide: getModelToken(Hotel.name), useValue: hotelModel },
        { provide: getModelToken(Room.name), useValue: roomModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(ModeratorAssignment.name), useValue: assignmentModel },
      ],
    }).compile();
    service = moduleRef.get(HotelReservationsService);
  });

  describe('listMine (HTL-20)', () => {
    it('shows reference, hotel, rooms, dates, guests, total and status', async () => {
      bookingModel.find.mockReturnValue(found([booking()]));
      lookups();
      counts(1, 4, 2);

      const page = await service.listMine(userId.toString(), { group: ReservationGroup.UPCOMING, page: 1 }, NOW);

      expect(page.items).toEqual([
        {
          id: expect.any(String),
          bookingReference: 'HTL-AAAAAA',
          hotel: { id: hotelId.toString(), name: 'Nile Palace', address: '1 Corniche' },
          rooms: [
            { roomId: roomA.toString(), roomNumber: '101', type: 'Deluxe', pricePerNight: 100, adults: 2, children: 1 },
            { roomId: roomB.toString(), roomNumber: '102', type: 'Standard', pricePerNight: 120, adults: 1, children: 0 },
          ],
          checkIn: '2026-12-20',
          checkOut: '2026-12-23',
          nights: 3,
          adults: 3,
          children: 1,
          totalPrice: 660,
          currency: 'USD',
          status: 'CONFIRMED',
        },
      ]);
      expect(page).toMatchObject({ group: 'upcoming', total: 1, page: 1, pageSize: 10, totalPages: 1 });
      expect(page.counts).toEqual({ upcoming: 1, past: 4, cancelled: 2 });
    });

    it('defaults to the upcoming group and only reads the guest\'s own reservations', async () => {
      bookingModel.find.mockReturnValue(found([]));
      counts();
      await service.listMine(userId.toString(), {}, NOW);

      const filter = bookingModel.find.mock.calls[0][0];
      expect(filter.user).toEqual(userId);
      expect(filter).toMatchObject({ status: 'CONFIRMED', checkOut: { $gt: NOW } });
    });

    it('upcoming = Confirmed stays that have not ended, next stay first', async () => {
      const chain = found([]);
      bookingModel.find.mockReturnValue(chain);
      counts();
      await service.listMine(userId.toString(), { group: ReservationGroup.UPCOMING }, NOW);
      expect(chain.sort).toHaveBeenCalledWith({ checkIn: 1, _id: 1 });
    });

    it('past = Completed stays, or Confirmed stays already over, most recent first', async () => {
      const chain = found([]);
      bookingModel.find.mockReturnValue(chain);
      counts();
      await service.listMine(userId.toString(), { group: ReservationGroup.PAST }, NOW);

      expect(bookingModel.find.mock.calls[0][0].$or).toEqual([
        { status: 'COMPLETED' },
        { status: 'CONFIRMED', checkOut: { $lte: NOW } },
      ]);
      expect(chain.sort).toHaveBeenCalledWith({ checkOut: -1, _id: -1 });
    });

    it('cancelled = Cancelled reservations only; unpaid holds are never listed', async () => {
      bookingModel.find.mockReturnValue(found([booking({ status: 'CANCELLED' })]));
      lookups();
      counts(0, 0, 1);
      const page = await service.listMine(userId.toString(), { group: ReservationGroup.CANCELLED }, NOW);

      expect(bookingModel.find.mock.calls[0][0]).toMatchObject({ status: 'CANCELLED' });
      expect(page.items[0].status).toBe('CANCELLED');
      const everyFilter = JSON.stringify(bookingModel.find.mock.calls) + JSON.stringify(bookingModel.countDocuments.mock.calls);
      expect(everyFilter).not.toContain('PENDING_PAYMENT');
      expect(everyFilter).not.toContain('EXPIRED');
    });

    it('shows a finished Confirmed stay as Completed before the hourly job stores it', async () => {
      bookingModel.find.mockReturnValue(
        found([booking({ checkIn: day('2026-11-20'), checkOut: day('2026-11-23') })]),
      );
      lookups();
      counts(0, 1, 0);
      const page = await service.listMine(userId.toString(), { group: ReservationGroup.PAST }, NOW);
      expect(page.items[0].status).toBe('COMPLETED');
    });

    it('paginates 10 per page using the size of the chosen group', async () => {
      const chain = found([]);
      bookingModel.find.mockReturnValue(chain);
      counts(0, 23, 0);
      const page = await service.listMine(userId.toString(), { group: ReservationGroup.PAST, page: 3 }, NOW);

      expect(chain.skip).toHaveBeenCalledWith(20);
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(page).toMatchObject({ total: 23, page: 3, totalPages: 3, items: [] });
    });

    it('keeps a reservation whose hotel or room was removed readable', async () => {
      bookingModel.find.mockReturnValue(found([booking({ bookingReference: undefined })]));
      hotelModel.find.mockReturnValue(found([]));
      roomModel.find.mockReturnValue(found([]));
      counts(1);
      const [item] = (await service.listMine(userId.toString(), {}, NOW)).items;
      expect(item.bookingReference).toBeNull();
      expect(item.hotel.name).toBeNull();
      expect(item.rooms[0].roomNumber).toBeNull();
    });
  });

  describe('getMine (HTL-20 details)', () => {
    it('returns the full details of the guest\'s own reservation', async () => {
      bookingModel.findOne.mockReturnValue({ lean: () => execResult(booking()) });
      lookups();
      const details = await service.getMine(userId.toString(), new Types.ObjectId().toString(), NOW);
      expect(details).toMatchObject({
        bookingReference: 'HTL-AAAAAA',
        nights: 3,
        createdAt: '2026-11-10T09:30:00.000Z',
        policiesAcceptedAt: '2026-11-10T09:31:00.000Z',
      });
      expect(details.rooms).toHaveLength(2);
    });

    it('looks the reservation up by id AND owner, and only among real reservations', async () => {
      bookingModel.findOne.mockReturnValue({ lean: () => execResult(null) });
      const id = new Types.ObjectId();
      await service.getMine(userId.toString(), id.toString(), NOW).catch(() => undefined);
      const filter = bookingModel.findOne.mock.calls[0][0];
      expect(filter._id).toEqual(id);
      expect(filter.user).toEqual(userId);
      expect(filter.status.$in).toEqual(['CONFIRMED', 'COMPLETED', 'CANCELLED']);
    });

    it('returns 404 for another guest\'s reservation or an unknown id', async () => {
      bookingModel.findOne.mockReturnValue({ lean: () => execResult(null) });
      await expect(
        service.getMine(userId.toString(), new Types.ObjectId().toString(), NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 for an id that is not an ObjectId, without querying', async () => {
      await expect(service.getMine(userId.toString(), 'abc', NOW)).rejects.toBeInstanceOf(NotFoundException);
      expect(bookingModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('listForHotel (HTL-22)', () => {
    const moderator = { sub: new Types.ObjectId().toString(), role: UserRole.MODERATOR, sid: 's' };
    const guestId = new Types.ObjectId();
    const setup = (over: { hotel?: unknown; assigned?: unknown; bookings?: unknown[]; total?: number } = {}) => {
      hotelModel.findById.mockReturnValue(
        found('hotel' in over ? over.hotel : { _id: hotelId }),
      );
      assignmentModel.exists.mockReturnValue(execResult('assigned' in over ? over.assigned : { _id: 'a' }));
      bookingModel.find.mockReturnValue(found(over.bookings ?? []));
      bookingModel.countDocuments.mockReturnValue(execResult(over.total ?? (over.bookings ?? []).length));
      userModel.find.mockReturnValue(
        found([{ _id: guestId, firstName: 'Mariam', lastName: 'Mashoud', email: 'm@example.com' }]),
      );
    };
    const run = (query = {}) => service.listForHotel(hotelId.toString(), query, moderator, NOW);

    it('returns 404 for an unknown hotel or an invalid id', async () => {
      setup({ hotel: null });
      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.listForHotel('abc', {}, moderator, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 403 and reads nothing when the moderator is not assigned to the hotel', async () => {
      setup({ assigned: null });
      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
      expect(bookingModel.find).not.toHaveBeenCalled();
    });

    it('checks the assignment for this moderator and this hotel', async () => {
      setup();
      await run();
      expect(assignmentModel.exists.mock.calls[0][0]).toMatchObject({
        moderatorId: new Types.ObjectId(moderator.sub),
        providerType: 'hotel',
        providerId: hotelId,
      });
    });

    it('lists guest, dates and status of this hotel\'s real reservations, latest check-in first', async () => {
      const chain = found([booking({ user: guestId })]);
      setup();
      bookingModel.find.mockReturnValue(chain);
      const page = await run();

      expect(page.items).toEqual([
        {
          id: expect.any(String),
          bookingReference: 'HTL-AAAAAA',
          guest: { id: guestId.toString(), name: 'Mariam Mashoud', email: 'm@example.com' },
          checkIn: '2026-12-20',
          checkOut: '2026-12-23',
          roomCount: 2,
          totalPrice: 660,
          status: 'CONFIRMED',
        },
      ]);
      const filter = bookingModel.find.mock.calls[0][0];
      expect(filter.hotel).toEqual(hotelId);
      expect(filter.status.$in).toEqual(['CONFIRMED', 'COMPLETED', 'CANCELLED']);
      expect(chain.sort).toHaveBeenCalledWith({ checkIn: -1, _id: -1 });
    });

    it('filters by status', async () => {
      setup();
      await run({ status: ReservationViewStatus.CANCELLED });
      expect(bookingModel.find.mock.calls[0][0]).toMatchObject({ hotel: hotelId, status: 'CANCELLED' });
    });

    it('treats a Confirmed stay that is over as Completed (filter and shown status)', async () => {
      setup({ bookings: [booking({ user: guestId, checkIn: day('2026-11-20'), checkOut: day('2026-11-23') })] });
      const page = await run({ status: ReservationViewStatus.COMPLETED });
      expect(page.items[0].status).toBe('COMPLETED');
      expect(bookingModel.find.mock.calls[0][0].$or).toContainEqual({ status: 'CONFIRMED', checkOut: { $lte: NOW } });
    });

    it('paginates 10 per page', async () => {
      const chain = found([]);
      setup({ total: 25 });
      bookingModel.find.mockReturnValue(chain);
      const page = await run({ page: 2 });
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(page).toMatchObject({ total: 25, page: 2, totalPages: 3 });
    });

    it('shows a null guest name when the user no longer exists', async () => {
      setup({ bookings: [booking({ user: new Types.ObjectId() })] });
      const [item] = (await run()).items;
      expect(item.guest.name).toBeNull();
      expect(item.guest.email).toBeNull();
    });
  });
});
