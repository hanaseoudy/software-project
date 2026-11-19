import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ItineraryFlightsController } from './itinerary-flights.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ItineraryTripType } from './dto/itinerary-flight-search-query.dto';
describe('ITN-26 controller', () => {
  const flights = { search: jest.fn() },
    controller = new ItineraryFlightsController(flights as never);
  const req = { user: { sub: 'owner' }, query: {} } as AuthenticatedRequest;
  const query = { departureAirport: 'CAI', adults: 1 };
  beforeEach(() => jest.clearAllMocks());
  it('registers PDF GET route with JWT auth and passes the current owner', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ItineraryFlightsController)).toBe(
      'itineraries',
    );
    expect(Reflect.getMetadata(PATH_METADATA, controller.search)).toBe(
      ':id/flights',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, controller.search)).toBe(
      RequestMethod.GET,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ItineraryFlightsController),
    ).toContain(JwtAuthGuard);
    controller.search(req, 'id', query);
    expect(flights.search).toHaveBeenCalledWith('owner', 'id', query);
  });
  it.each([
    'arrivalAirport',
    'destinationAirport',
    'city',
    'country',
    'page',
    'userId',
  ])('rejects unsupported %s', (field) => {
    expect(() =>
      controller.search(
        { ...req, query: { [field]: 'override' } } as AuthenticatedRequest,
        'id',
        query,
      ),
    ).toThrow('Validation failed');
    expect(flights.search).not.toHaveBeenCalled();
  });
  it.each(['returnDate', 'returnPage'])(
    'rejects raw %s on ONE_WAY but permits it on ROUND_TRIP',
    (field) => {
      const raw = { ...req, query: { [field]: '1' } } as AuthenticatedRequest;
      expect(() => controller.search(raw, 'id', query)).toThrow(
        'Validation failed',
      );
      controller.search(raw, 'id', {
        ...query,
        tripType: ItineraryTripType.ROUND_TRIP,
      });
      expect(flights.search).toHaveBeenCalledTimes(1);
    },
  );
});
