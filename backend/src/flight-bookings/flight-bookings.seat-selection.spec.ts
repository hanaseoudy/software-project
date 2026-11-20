import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightBookingStatus } from './schemas/flight-booking.schema';
import { PassengerType } from './schemas/passenger.schema';

describe('FLT-28 seat selection', () => {
  const userId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const passengerId = new Types.ObjectId();
  const otherPassengerId = new Types.ObjectId();
  const flightId = new Types.ObjectId();

  let bookingModel: { findOne: jest.Mock };
  let booking: any;
  let service: FlightBookingsService;

  beforeEach(() => {
    booking = {
      _id: bookingId,
      user: userId,
      outboundFlight: flightId,
      cabinClass: 'ECONOMY',
      status: FlightBookingStatus.PENDING_PAYMENT,
      holdExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      passengers: [
        {
          _id: passengerId,
          firstName: 'Sara',
          lastName: 'Gomaa',
          type: PassengerType.ADULT,
        },
        {
          _id: otherPassengerId,
          firstName: 'Omar',
          lastName: 'Hassan',
          type: PassengerType.CHILD,
        },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };
    bookingModel = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(booking)
        .mockResolvedValue(null),
    };
    service = new FlightBookingsService(
      {} as never,
      bookingModel as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('saves unique seats for every adult and child passenger', async () => {
    const result = await service.selectSeats(userId.toString(), bookingId.toString(), {
      passengers: [
        { passengerId: passengerId.toString(), seatNumber: '12A' },
        { passengerId: otherPassengerId.toString(), seatNumber: '12B' },
      ],
    });

    expect(booking.save).toHaveBeenCalled();
    expect(result.passengers).toEqual([
      expect.objectContaining({
        passengerId: passengerId.toString(),
        seatNumber: '12A',
      }),
      expect.objectContaining({
        passengerId: otherPassengerId.toString(),
        seatNumber: '12B',
      }),
    ]);
  });

  it('rejects duplicate seats', async () => {
    await expect(
      service.selectSeats(userId.toString(), bookingId.toString(), {
        passengers: [
          { passengerId: passengerId.toString(), seatNumber: '12A' },
          { passengerId: otherPassengerId.toString(), seatNumber: '12A' },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects unknown passenger IDs', async () => {
    await expect(
      service.selectSeats(userId.toString(), bookingId.toString(), {
        passengers: [
          { passengerId: passengerId.toString(), seatNumber: '12A' },
          { passengerId: new Types.ObjectId().toString(), seatNumber: '12B' },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects bookings that are missing or owned by another user', async () => {
    bookingModel.findOne.mockReset();
    bookingModel.findOne.mockResolvedValue(null);

    await expect(
      service.selectSeats(userId.toString(), bookingId.toString(), {
        passengers: [
          { passengerId: passengerId.toString(), seatNumber: '12A' },
          { passengerId: otherPassengerId.toString(), seatNumber: '12B' },
        ],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
