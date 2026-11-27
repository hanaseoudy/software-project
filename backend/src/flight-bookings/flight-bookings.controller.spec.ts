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

describe('FlightBookingsController change flight route (FLT-27)', () => {
  const handler = FlightBookingsController.prototype.change;

  it('is PATCH /flight-bookings/:id/change-flight', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':id/change-flight',
    );
  });

  it('no longer answers on POST :id/change', () => {
    const routes = Object.getOwnPropertyNames(
      FlightBookingsController.prototype,
    )
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const fn = FlightBookingsController.prototype[
          name as keyof FlightBookingsController
        ] as unknown as object;
        return [
          Reflect.getMetadata(METHOD_METADATA, fn),
          Reflect.getMetadata(PATH_METADATA, fn),
        ];
      });
    expect(routes).not.toContainEqual([RequestMethod.POST, ':id/change']);
  });

  it('passes the logged-in user, booking id and body to the change service', () => {
    const changeService = { requestChange: jest.fn().mockReturnValue('done') };
    const controller = new FlightBookingsController(
      {} as never,
      {} as never,
      changeService as never,
    );
    const dto = { confirm: true } as never;
    const result = controller.change(
      { user: { sub: 'u1' } } as never,
      'b1',
      dto,
    );
    expect(changeService.requestChange).toHaveBeenCalledWith('u1', 'b1', dto);
    expect(result).toBe('done');
  });
});
