import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ItineraryHotelsController } from './itinerary-hotels.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';

describe('ITN-25 controller', () => {
  const service = { search: jest.fn() },
    controller = new ItineraryHotelsController(service as never);
  const req = { user: { sub: 'owner' }, query: {} } as AuthenticatedRequest;
  beforeEach(() => jest.clearAllMocks());
  it('registers the PDF GET path and existing JWT guard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ItineraryHotelsController)).toBe(
      'itineraries',
    );
    expect(Reflect.getMetadata(PATH_METADATA, controller.search)).toBe(
      ':id/hotels',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, controller.search)).toBe(
      RequestMethod.GET,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ItineraryHotelsController),
    ).toContain(JwtAuthGuard);
  });
  it('passes authenticated ownership and only the approved query DTO', () => {
    const query = { groupFirstDayId: 'day', guests: 2, rooms: 1, page: 1 };
    controller.search(req, 'itinerary', query);
    expect(service.search).toHaveBeenCalledWith('owner', 'itinerary', query);
  });
  it.each([
    'city',
    'country',
    'checkIn',
    'checkOut',
    'dayIds',
    'groupIndex',
    'userId',
    'unexpected',
  ])('rejects raw %s override', (field) => {
    expect(() =>
      controller.search(
        { ...req, query: { [field]: 'override' } } as AuthenticatedRequest,
        'id',
        { groupFirstDayId: 'day', guests: 1 },
      ),
    ).toThrow('Validation failed');
    expect(service.search).not.toHaveBeenCalled();
  });
});
