import { Controller, Get, Query } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { PaginatedResponseDto, PaginationQueryDto } from '../common/pagination/pagination';
import { CountryResponseDto } from './dto/country-response.dto';
import { ReferenceDataService } from './reference-data.service';

@ApiTags('Reference Data')
@ApiExtraModels(PaginatedResponseDto, CountryResponseDto)
@Controller('countries')
export class CountriesController {
  constructor(private readonly referenceData: ReferenceDataService) {}

  @Get()
  @ApiOperation({
    summary: 'List countries (BE-1, GEN-12)',
    description:
      'Public. The countries seeded by GEN-12, sorted by name, 10 per page. Each item gives both the database id (hotels: HTL-01, HTL-11) and the country code (itineraries: ITN-01, ITN-21).',
  })
  @ApiResponse({
    status: 200,
    description: 'One page of countries',
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResponseDto) },
        { properties: { items: { type: 'array', items: { $ref: getSchemaPath(CountryResponseDto) } } } },
      ],
      example: {
        items: [{ id: '6aeeecf022a36c4e4cf3014e', code: 'EG', name: 'Egypt', currency: 'EGP' }],
        total: 8,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid page',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { page: ['Page must be at least 1'] } },
  })
  findAll(@Query() query: PaginationQueryDto) {
    return this.referenceData.listCountries(query.page);
  }
}
