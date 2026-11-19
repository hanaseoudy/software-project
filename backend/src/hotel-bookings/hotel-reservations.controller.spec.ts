import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { HotelBookingsController } from './hotel-bookings.controller';
import { ReviewsService } from './reviews.service';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelReservationsController } from './hotel-reservations.controller';
import { HotelReservationsService } from './hotel-reservations.service';

describe('reservation controllers (HTL-20 / HTL-22)', () => {
  const service = { listMine: jest.fn(), getMine: jest.fn(), listForHotel: jest.fn() };
  const guest = { user: { sub: 'u1', role: UserRole.USER } } as never;
  const moderator = { user: { sub: 'm1', role: UserRole.MODERATOR } } as never;
  let bookings: HotelBookingsController;
  let hotels: HotelReservationsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HotelBookingsController, HotelReservationsController],
      providers: [
        { provide: HotelBookingsService, useValue: {} },
        { provide: ReviewsService, useValue: {} },
        { provide: HotelReservationsService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    bookings = moduleRef.get(HotelBookingsController);
    hotels = moduleRef.get(HotelReservationsController);
  });

  it('listMine passes the logged-in guest and the query', async () => {
    service.listMine.mockResolvedValue({ items: [] });
    await bookings.listMine(guest, { group: 'past' } as never);
    expect(service.listMine).toHaveBeenCalledWith('u1', { group: 'past' });
  });

  it('getMine passes the logged-in guest and the reservation id', async () => {
    service.getMine.mockResolvedValue({ id: 'r1' });
    await bookings.getMine(guest, 'r1');
    expect(service.getMine).toHaveBeenCalledWith('u1', 'r1');
  });

  it('the moderator list passes the hotel id, the query and the logged-in moderator', async () => {
    service.listForHotel.mockResolvedValue({ items: [] });
    await hotels.list('h1', { status: 'CANCELLED' } as never, moderator);
    expect(service.listForHotel).toHaveBeenCalledWith('h1', { status: 'CANCELLED' }, { sub: 'm1', role: UserRole.MODERATOR });
  });
});
