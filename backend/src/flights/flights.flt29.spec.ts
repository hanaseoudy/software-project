import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FlightsService } from './flights.service';

describe('FLT-29 moderator flight bookings', () => {
  const moderatorId = new Types.ObjectId();
  const airlineId = new Types.ObjectId();
  const otherAirlineId = new Types.ObjectId();
  const flightId = new Types.ObjectId();

  const flight = {
    _id: flightId,
    flightNumber: 'MS777',
    airline: airlineId,
    cabins: [
      {
        cabinClass: 'ECONOMY',
        totalSeats: 100,
        bookedSeats: 40,
        heldSeats: 5,
      },
      {
        cabinClass: 'BUSINESS',
        totalSeats: 20,
        bookedSeats: 8,
        heldSeats: 2,
      },
    ],
  };

  const bookings = [
    {
      bookingReference: 'FLT-ABC123',
      cabinClass: 'ECONOMY',
      status: 'CONFIRMED',
      passengers: [
        {
          firstName: 'Sara',
          lastName: 'Gomaa',
          seatNumber: '12A',
        },
        {
          firstName: 'Omar',
          lastName: 'Hassan',
          seatNumber: null,
        },
      ],
    },
  ];

  let assignmentModel: { findOne: jest.Mock };
  let flightsModel: { findById: jest.Mock };
  let bookingModel: { find: jest.Mock };
  let service: FlightsService;

  beforeEach(() => {
    assignmentModel = {
      findOne: jest.fn().mockResolvedValue({
        providerId: airlineId,
        providerType: 'airline',
      }),
    };
    flightsModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(flight),
      }),
    };
    bookingModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(bookings),
        }),
      }),
    };
    service = new FlightsService(
      flightsModel as never,
      {} as never,
      assignmentModel as never,
      {} as never,
      bookingModel as never,
    );
  });

  it('returns the owned flight bookings and remaining seats', async () => {
    const report = await service.getModeratorFlightBookings(
      flightId.toString(),
      moderatorId.toString(),
    );

    expect(report.flightNumber).toBe('MS777');
    expect(report.cabinsRemaining).toEqual([
      { cabinClass: 'ECONOMY', seatsRemaining: 55 },
      { cabinClass: 'BUSINESS', seatsRemaining: 10 },
    ]);
    expect(report.bookings).toEqual(bookings);
  });

  it('exports a CSV with passenger details and escaped fields', async () => {
    const csv = await service.getModeratorPassengerCsv(
      flightId.toString(),
      moderatorId.toString(),
    );

    expect(csv).toContain('"Booking Reference","Passenger Name","Cabin","Seat","Status"');
    expect(csv).toContain('"FLT-ABC123","Sara Gomaa","ECONOMY","12A","CONFIRMED"');
  });

  it('rejects a moderator assigned to another airline', async () => {
    assignmentModel.findOne.mockResolvedValue({
      providerId: otherAirlineId,
      providerType: 'airline',
    });

    await expect(
      service.getModeratorFlightBookings(
        flightId.toString(),
        moderatorId.toString(),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an unknown flight', async () => {
    flightsModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.getModeratorFlightBookings(
        flightId.toString(),
        moderatorId.toString(),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
