import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FlightsService } from './flights.service';
import { FlightStatus } from './schemas/flight.schema';

describe('FLT-05 flight updates', () => {
  const flightId = new Types.ObjectId();
  const airlineId = new Types.ObjectId();
  const moderatorId = new Types.ObjectId();
  const cabinId = new Types.ObjectId();

  let flight: {
    _id: Types.ObjectId;
    airline: Types.ObjectId;
    status: FlightStatus;
    departureTime: Date;
    cabins: Array<{
      _id: Types.ObjectId;
      cabinClass: string;
      totalSeats: number;
      bookedSeats: number;
      heldSeats: number;
      price: number;
    }>;
  };
  let flightsModel: {
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let assignments: { findOne: jest.Mock };
  let service: FlightsService;

  beforeEach(() => {
    flight = {
      _id: flightId,
      airline: airlineId,
      status: FlightStatus.SCHEDULED,
      departureTime: new Date(Date.now() + 60 * 60 * 1000),
      cabins: [
        {
          _id: cabinId,
          cabinClass: 'ECONOMY',
          totalSeats: 30,
          bookedSeats: 10,
          heldSeats: 5,
          price: 100,
        },
      ],
    };
    flightsModel = {
      findById: jest.fn().mockResolvedValue(flight),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
    };
    assignments = {
      findOne: jest.fn().mockResolvedValue({ providerId: airlineId }),
    };
    service = new FlightsService(
      flightsModel as never,
      {} as never,
      assignments as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('rejects invalid flight IDs before querying MongoDB', async () => {
    await expect(
      service.updateCabin('not-an-id', cabinId.toString(), moderatorId.toString(), {
        price: 120,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(flightsModel.findById).not.toHaveBeenCalled();
  });

  it('rejects a seat count below booked and held inventory', async () => {
    await expect(
      service.updateCabin(
        flightId.toString(),
        cabinId.toString(),
        moderatorId.toString(),
        { totalSeats: 14 },
      ),
    ).rejects.toThrow(ConflictException);

    expect(flightsModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns a conflict if cabin seat counts changed before the atomic update', async () => {
    await expect(
      service.updateCabin(
        flightId.toString(),
        cabinId.toString(),
        moderatorId.toString(),
        { totalSeats: 35 },
      ),
    ).rejects.toThrow(ConflictException);

    expect(flightsModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: flightId,
        airline: airlineId,
        status: FlightStatus.SCHEDULED,
        cabins: {
          $elemMatch: {
            _id: cabinId,
            totalSeats: 30,
            bookedSeats: 10,
            heldSeats: 5,
          },
        },
      },
      { $set: { 'cabins.$.totalSeats': 35 } },
      { new: true, runValidators: true },
    );
  });
});
