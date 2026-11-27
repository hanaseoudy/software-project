import { Controller, Get, Query } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { PaginatedResponseDto } from '../common/pagination/pagination';
import { CityResponseDto } from './dto/city-response.dto';
import { ListCitiesQueryDto } from './dto/list-cities-query.dto';
import { ReferenceDataService } from './reference-data.service';

@ApiTags('Reference Data')
@ApiExtraModels(PaginatedResponseDto, CityResponseDto)
@Controller('cities')
export class CitiesController {
  constructor(private readonly referenceData: ReferenceDataService) {}

  @Get()
  @ApiOperation({
    summary: 'List cities, optionally filtered by country (GEN-12, HTL-01, HTL-11, ITN-01, ITN-05, ITN-16, ITN-21)',
    description:
      'Public. The cities seeded by GEN-12, sorted by name, 10 per page. Filter with country = a country code (EG) or a country id from GET /api/countries; an unknown country returns an empty page. Each item gives both the database id (hotels: HTL-01, HTL-11) and the city id (itineraries: ITN-05, ITN-16, ITN-21).',
  })
  @ApiResponse({
    status: 200,
    description: 'One page of cities',
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResponseDto) },
        { properties: { items: { type: 'array', items: { $ref: getSchemaPath(CityResponseDto) } } } },
      ],
      example: {
        items: [{ id: '6aeeecf022a36c4e4cf30156', cityId: 'cairo', name: 'Cairo', countryCode: 'EG' }],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid page or country',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: { country: ['Country must be a 2-letter country code or a country id'] },
    },
  })
  findAll(@Query() query: ListCitiesQueryDto) {
    return this.referenceData.listCities(query.page, query.country);
  }
}
