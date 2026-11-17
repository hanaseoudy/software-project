import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Flight } from '../flights/schemas/flight.schema';
import {
  FlightBooking,
  FlightBookingStatus,
} from './schemas/flight-booking.schema';

/**
 * GEN-11: a CONFIRMED flight booking becomes COMPLETED once its last flight
 * has arrived (the return flight for round trips, otherwise the outbound
 * flight). Runs hourly. Only CONFIRMED bookings are ever touched.
 */
@Injectable()
export class FlightCompletionService {
  private readonly logger = new Logger(FlightCompletionService.name);

  constructor(
    @InjectModel(FlightBooking.name)
    private readonly bookingModel: Model<FlightBooking>,
    @InjectModel(Flight.name)
    private readonly flightModel: Model<Flight>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async completeArrivedBookings(now: Date = new Date()): Promise<number> {
    const arrived = await this.bookingModel.aggregate<{ _id: Types.ObjectId }>([
      { $match: { status: FlightBookingStatus.CONFIRMED } },
      {
        $addFields: {
          lastFlightId: { $ifNull: ['$returnFlight', '$outboundFlight'] },
        },
      },
      {
        $lookup: {
          from: this.flightModel.collection.name,
          localField: 'lastFlightId',
          foreignField: '_id',
          as: 'lastFlight',
        },
      },
      { $match: { 'lastFlight.arrivalTime': { $lte: now } } },
      { $project: { _id: 1 } },
    ]);
    if (arrived.length === 0) return 0;

    // Re-check status in the update so a booking cancelled in the meantime
    // is never moved to COMPLETED.
    const result = await this.bookingModel.updateMany(
      {
        _id: { $in: arrived.map((b) => b._id) },
        status: FlightBookingStatus.CONFIRMED,
      },
      { $set: { status: FlightBookingStatus.COMPLETED } },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Completed ${result.modifiedCount} flight booking(s)`);
    }
    return result.modifiedCount;
  }
}
