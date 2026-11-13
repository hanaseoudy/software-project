// flights.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { fromZonedTime } from 'date-fns-tz';
import { Flight, FlightDocument, FlightStatus } from './schemas/flight.schema';
import { Airport, AirportDocument } from '../airports/schemas/airport.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentDocument,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { CreateFlightsDto } from './dto/create-flights.dto';
import { formatFlightWithLocalTimes } from './utils/flight-time.formatter';
import { AddCabinDto } from './dto/add-cabin.dto';
import { isValidObjectId } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class FlightsService {
  private readonly logger = new Logger(FlightsService.name);

  constructor(
    @InjectModel(Flight.name)
    private readonly flightsModel: Model<FlightDocument>,
    @InjectModel(Airport.name)
    private readonly airportModel: Model<AirportDocument>,
    @InjectModel(ModeratorAssignment.name)
    private readonly assignmentModel: Model<ModeratorAssignmentDocument>,
  ) {}

  async create(moderatorId: string, dto: CreateFlightsDto) {
    const airlineId = await this.getModeratorAirlineId(moderatorId);
    const { departureAirport, arrivalAirport } = await this.getAirports(
      dto.departureAirport,
      dto.arrivalAirport,
    );

    this.assertRealLocalDateTime(dto.departureTime, 'departureTime');
    this.assertRealLocalDateTime(dto.arrivalTime, 'arrivalTime');

    const departureUtc = fromZonedTime(
      dto.departureTime,
      departureAirport.timezone,
    );
    const arrivalUtc = fromZonedTime(dto.arrivalTime, arrivalAirport.timezone);

    this.validateFlightSchedule(
      dto.departureAirport,
      dto.arrivalAirport,
      departureUtc,
      arrivalUtc,
    );

    const departureLocalDate = dto.departureTime.split('T')[0]; // or via date-fns-tz

    await this.ensureNoDuplicateFlight(
      airlineId,
      dto.flightNumber,
      departureLocalDate,
    );

    let flight: FlightDocument;
    try {
      flight = await this.flightsModel.create({
        airline: airlineId,
        flightNumber: dto.flightNumber,
        departureAirport: departureAirport._id,
        arrivalAirport: arrivalAirport._id,
        departureTime: departureUtc,
        arrivalTime: arrivalUtc,
        departureLocalDate,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          'A flight with this number already exists on this date',
        );
      }
      throw err;
    }

    // Populate the references before returning the response
    const populatedFlight = await flight.populate([
      'airline',
      'departureAirport',
      'arrivalAirport',
    ]);

    return formatFlightWithLocalTimes(populatedFlight);
  }
  /**
   * FLT-30: Automatically transitions Scheduled flights to Departed
   * once their departureTime (UTC) has passed.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async markDepartedFlights(): Promise<void> {
    const now = new Date();
    const result = await this.flightsModel.updateMany(
      {
        status: FlightStatus.SCHEDULED,
        departureTime: { $lte: now },
      },
      {
        $set: { status: FlightStatus.DEPARTED },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Transitioned ${result.modifiedCount} flight(s) from SCHEDULED to DEPARTED`,
      );
    }
  }

  /**
   * FLT-30: Ensures a flight is currently Scheduled and has not passed its departure time.
   * Also lazily syncs the DB status if departureTime just passed before the next cron tick.
   */

  async assertFlightScheduled(flight: FlightDocument): Promise<void> {
    if (flight.status === FlightStatus.CANCELLED) {
      throw new BadRequestException('Cannot modify or book a cancelled flight');
    }

    if (
      flight.status === FlightStatus.DEPARTED ||
      new Date(flight.departureTime) <= new Date()
    ) {
      if (flight.status === FlightStatus.SCHEDULED) {
        flight.status = FlightStatus.DEPARTED;
        await flight.save();
      }
      throw new BadRequestException('Cannot modify or book a departed flight');
    }
  }

  async addCabin(flightId: string, userId: string, dto: AddCabinDto) {
    if (!isValidObjectId(flightId)) {
      throw new BadRequestException('Invalid flight ID format');
    }
    if (!isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const flight = await this.flightsModel.findById(flightId);
    if (!flight) {
      throw new NotFoundException('Flight not found');
    }

    // 3. Security: Check if this moderator owns the airline that owns this flight
    const moderatorAirlineId = await this.getModeratorAirlineId(userId);
    if (flight.airline.toString() !== moderatorAirlineId.toString()) {
      throw new ForbiddenException(
        'You do not have permission to modify cabins for this flight',
      );
    }

    await this.assertFlightScheduled(flight);

    // 4. Rule: Each cabin category used at most once per flight
    const cabinExists = flight.cabins.some(
      (c) => c.cabinClass === dto.cabinClass,
    );
    if (cabinExists) {
      throw new ConflictException(
        `Cabin class ${dto.cabinClass} already exists on this flight`,
      );
    }

    if (flight.status !== FlightStatus.SCHEDULED) {
      throw new ConflictException(
        'Cabins can only be added to Scheduled flights',
      );
    }

    const updated = await this.flightsModel.findOneAndUpdate(
      { _id: flightId, 'cabins.cabinClass': { $ne: dto.cabinClass } },
      { $push: { cabins: { ...dto, bookedSeats: 0, heldSeats: 0 } } },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new ConflictException(
        'Cabin could not be added: it may already exist or the flight changed. Please retry.',
      );
    }

    return formatFlightWithLocalTimes(
      await flight.populate(['airline', 'departureAirport', 'arrivalAirport']),
    );
  }

  private async getModeratorAirlineId(userId: string) {
    if (!userId)
      throw new ForbiddenException('You are not assigned to an airline'); // new line
    const assignment = await this.assignmentModel.findOne({
      moderatorId: userId,
      providerType: ProviderType.AIRLINE,
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to an airline');
    }

    return assignment.providerId;
  }

  private async getAirports(
    departureCode: CreateFlightsDto['departureAirport'],
    arrivalCode: CreateFlightsDto['arrivalAirport'],
  ): Promise<{
    departureAirport: AirportDocument;
    arrivalAirport: AirportDocument;
  }> {
    const departureIata = departureCode as unknown as string;
    const arrivalIata = arrivalCode as unknown as string;
    const codes =
      departureIata === arrivalIata
        ? [departureIata]
        : [departureIata, arrivalIata];

    const airports = await this.airportModel
      .find({ iataCode: { $in: codes } })
      .exec();

    const airportByCode = new Map(
      airports.map((airport) => [airport.iataCode, airport]),
    );

    const departureAirport = airportByCode.get(departureIata);
    const arrivalAirport = airportByCode.get(arrivalIata);

    if (!departureAirport || !arrivalAirport) {
      throw new BadRequestException('One or both airports do not exist');
    }

    return { departureAirport, arrivalAirport };
  }

  private validateFlightSchedule(
    departureAirport: CreateFlightsDto['departureAirport'],
    arrivalAirport: CreateFlightsDto['arrivalAirport'],
    departureUtc: Date,
    arrivalUtc: Date,
  ): void {
    if (departureAirport === arrivalAirport) {
      throw new BadRequestException(
        'Departure and Arrival airport cannot be the same.',
      );
    }

    if (arrivalUtc <= departureUtc) {
      throw new BadRequestException(
        'Arrival time cannot be before Departure time.',
      );
    }

    if (departureUtc < new Date()) {
      throw new BadRequestException('Departure time cannot be in the past.');
    }
  }

  private assertRealLocalDateTime(value: string, field: string): void {
    const [datePart, timePart] = value.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);

    const probe = new Date(Date.UTC(y, m - 1, d, hh, mm));
    const isReal =
      probe.getUTCFullYear() === y &&
      probe.getUTCMonth() === m - 1 &&
      probe.getUTCDate() === d &&
      probe.getUTCHours() === hh &&
      probe.getUTCMinutes() === mm;

    if (!isReal) {
      throw new BadRequestException(`${field} is not a real date and time`);
    }
  }

  private async ensureNoDuplicateFlight(
    airlineId: ModeratorAssignment['providerId'],
    flightNumber: string,
    departureLocalDate: string,
  ): Promise<void> {
    const existingFlight = await this.flightsModel
      .exists({ airline: airlineId, flightNumber, departureLocalDate })
      .exec();

    if (existingFlight) {
      throw new ConflictException(
        'A flight with this number already exists on this date',
      );
    }
  }
}
