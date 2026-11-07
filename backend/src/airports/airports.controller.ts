import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AirportsService } from './airports.service';
import { AirportResponseDto } from './dto/airport-response.dto';

@ApiTags('Airports')
@Controller('airports')
export class AirportsController {
  constructor(private readonly airportsService: AirportsService) {}

  @Get()
  @ApiOperation({
    summary: 'List predefined airports (FLT-02)',
    description:
      'Public, read-only airport list loaded by GEN-12. Sorted by IATA code. Returns an empty array when no predefined airports have been seeded.',
  })
  @ApiOkResponse({
    description:
      'Predefined airports available for flight creation and search.',
    type: AirportResponseDto,
    isArray: true,
  })
  findAll(): Promise<AirportResponseDto[]> {
    return this.airportsService.findAll();
  }
}
