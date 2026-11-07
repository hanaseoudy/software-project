import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { airports } from '../reference-data/reference-data.data';
import { Airport } from './schemas/airport.schema';
import type { AirportResponseDto } from './dto/airport-response.dto';

// Use the same predefined list as GEN-12, including when other records exist.
const airportCodes = airports.map(({ iata_code }) => iata_code);
const airportFields = '_id iataCode name city country timezone';

@Injectable()
export class AirportsService {
  constructor(
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
  ) {}

  async findAll(): Promise<AirportResponseDto[]> {
    const records = await this.airportModel
      .find({ iataCode: { $in: airportCodes } })
      .select(airportFields)
      .sort({ iataCode: 1 })
      .lean()
      .exec();

    return records.map((airport) => ({
      id: airport._id.toString(),
      iataCode: airport.iataCode,
      name: airport.name,
      city: airport.city,
      country: airport.country,
      timezone: airport.timezone,
    }));
  }

  // FLT-03 and FLT-11 must call this for each selected airport.
  async requireAirport(id: string) {
    if (typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id)) {
      throw new BadRequestException(
        'Select an airport from the predefined list.',
      );
    }

    const airport = await this.airportModel
      .findOne({ _id: id, iataCode: { $in: airportCodes } })
      .select(airportFields)
      .lean()
      .exec();

    if (!airport) {
      throw new BadRequestException(
        'Select an airport from the predefined list.',
      );
    }

    return airport;
  }
}
