import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { HotelBookingsController } from './hotel-bookings.controller';
import { HotelBookingsService } from './hotel-bookings.service';
import { ReviewsService } from './reviews.service';
import { HotelCancellationService } from './hotel-cancellation.service';
import { HotelReservationsService } from './hotel-reservations.service';

describe('HotelBookingsController cancellation routes (HTL-21)', () => {
  const service = { quote: jest.fn(), cancel: jest.fn() };
  const guest = { user: { sub: 'u1', role: UserRole.USER } } as never;
  let controller: HotelBookingsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HotelBookingsController],
      providers: [
        { provide: HotelBookingsService, useValue: {} },
        { provide: ReviewsService, useValue: {} },
        { provide: HotelCancellationService, useValue: service },
        { provide: HotelReservationsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(HotelBookingsController);
  });

  it('the quote passes the logged-in guest and the reservation id', async () => {
    service.quote.mockResolvedValue({ refundAmount: 330 });
    await expect(controller.cancellationQuote(guest, 'r1')).resolves.toEqual({ refundAmount: 330 });
    expect(service.quote).toHaveBeenCalledWith('u1', 'r1');
  });

  it('cancel passes the logged-in guest, the reservation id and the confirmed amount', async () => {
    service.cancel.mockResolvedValue({ status: 'CANCELLED' });
    await controller.cancel(guest, 'r1', { expectedRefundAmount: 330 });
    expect(service.cancel).toHaveBeenCalledWith('u1', 'r1', { expectedRefundAmount: 330 });
  });
});
