import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

export class ListCitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'EG',
    description: 'Only cities of this country: a 2-letter country code (EG) or a country id from GET /api/countries',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Country must be a country code or a country id' })
  @Matches(/^([A-Za-z]{2}|[a-fA-F0-9]{24})$/, {
    message: 'Country must be a 2-letter country code or a country id',
  })
  country?: string;
}
