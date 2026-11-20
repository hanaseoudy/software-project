import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { FlightBookingsController } from './flight-bookings.controller';

describe('FlightBookingsController create booking route', () => {
  const handler = FlightBookingsController.prototype.hold;

  it('is available as POST /flight-bookings and still as POST /flight-bookings/hold', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toEqual(['', 'hold']);
  });

  it('creates the booking for the logged-in user with the same code on both paths', () => {
    const service = { createHold: jest.fn().mockReturnValue('held') };
    const controller = new FlightBookingsController(
      service as never,
      {} as never,
      {} as never,
    );
    const dto = { passengers: [] } as never;
    const result = controller.hold({ user: { sub: 'u1' } } as never, dto);
    expect(service.createHold).toHaveBeenCalledWith('u1', dto);
    expect(result).toBe('held');
  });
});
