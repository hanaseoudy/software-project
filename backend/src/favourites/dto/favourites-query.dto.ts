import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { FavouriteType } from '../schemas/favourite.schema';

export class FavouritesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: FavouriteType,
    description: 'Only hotels or only itineraries (default: both)',
  })
  @IsOptional()
  @IsEnum(FavouriteType, { message: 'Type must be hotel or itinerary' })
  type?: FavouriteType;
}
