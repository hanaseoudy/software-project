import { ItineraryBookingLinksController } from './itinerary-booking-links.controller';
import { BookingType } from '../payments/enums/payment.enums';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
describe('ITN-27 controller', () => {
  const service = { create: jest.fn(), list: jest.fn(), remove: jest.fn() },
    controller = new ItineraryBookingLinksController(service as never),
    req = {
      user: { sub: 'owner' },
      body: {},
      query: {},
    } as AuthenticatedRequest;
  beforeEach(() => jest.clearAllMocks());
  it('passes authenticated owner for every operation', () => {
    const dto = {
      bookingType: BookingType.FLIGHT,
      bookingId: 'booking',
      dayIds: ['day'],
    };
    controller.create(req, 'itinerary', dto);
    controller.list(req, 'itinerary', { page: 2 });
    controller.remove(req, 'itinerary', 'link');
    expect(service.create).toHaveBeenCalledWith('owner', 'itinerary', dto);
    expect(service.list).toHaveBeenCalledWith('owner', 'itinerary', 2);
    expect(service.remove).toHaveBeenCalledWith('owner', 'itinerary', 'link');
  });
  it.each(['amount', 'currency', 'userId', 'itineraryId'])(
    'rejects %s overrides',
    (field) => {
      expect(() =>
        controller.create(
          { ...req, body: { [field]: 'override' } } as AuthenticatedRequest,
          'itinerary',
          {
            bookingType: BookingType.FLIGHT,
            bookingId: 'booking',
            dayIds: ['day'],
          },
        ),
      ).toThrow();
      expect(service.create).not.toHaveBeenCalled();
    },
  );
  it('rejects unsupported list queries', () => {
    expect(() =>
      controller.list(
        { ...req, query: { userId: 'other' } } as AuthenticatedRequest,
        'id',
        {},
      ),
    ).toThrow();
  });
});
