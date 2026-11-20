import { PartialType, PickType } from '@nestjs/swagger';
import { CreateFlightsDto } from './create-flights.dto';

// dto/update-flight.dto.ts
export class UpdateFlightDto extends PartialType(
  PickType(CreateFlightsDto, [
    'departureAirport',
    'arrivalAirport',
    'departureTime',
    'arrivalTime',
  ] as const),
) {}
