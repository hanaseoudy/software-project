import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// A field may be left out, but if it is sent it must be valid. `null` counts as sent,
// so it is rejected with a 400 instead of reaching the database.
const sent = (_object: unknown, value: unknown) => value !== undefined;

/** All fields optional; at least one must be provided (checked in the service). */
export class UpdateHotelDto {
  @ApiPropertyOptional({
    example: 'Nile Palace Hotel',
    minLength: 2,
    maxLength: 150,
  })
  @ValidateIf(sent)
  @Transform(trim)
  @IsString({ message: 'Name is required' })
  @IsNotEmpty({ message: 'Name is required' })
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(150, { message: 'Name must be at most 150 characters' })
  name?: string;

  @ApiPropertyOptional({ example: 'A five-star hotel on the Nile corniche.' })
  @ValidateIf(sent)
  @Transform(trim)
  @IsString({ message: 'Description must be text' })
  @MaxLength(3000, { message: 'Description must be at most 3000 characters' })
  description?: string;

  @ApiPropertyOptional({ example: '1 Corniche El Nil Street' })
  @ValidateIf(sent)
  @Transform(trim)
  @IsString({ message: 'Address is required' })
  @IsNotEmpty({ message: 'Address is required' })
  address?: string;

  @ApiPropertyOptional({
    description: 'City id from the seeded reference data (GEN-12)',
    example: '675f1b2c9d3e4a0012345678',
  })
  @ValidateIf(sent)
  @IsMongoId({ message: 'City must be a valid id' })
  city?: string;

  @ApiPropertyOptional({
    description: 'Country id from the seeded reference data (GEN-12)',
    example: '675f1b2c9d3e4a0087654321',
  })
  @ValidateIf(sent)
  @IsMongoId({ message: 'Country must be a valid id' })
  country?: string;

  @ApiPropertyOptional({
    example: 5,
    minimum: 1,
    maximum: 5,
    description: 'Star class',
  })
  @ValidateIf(sent)
  @IsInt({ message: 'Star rating must be a whole number between 1 and 5' })
  @Min(1, { message: 'Star rating must be at least 1' })
  @Max(5, { message: 'Star rating must be at most 5' })
  starRating?: number;

  @ApiPropertyOptional({ type: [String], example: ['wifi', 'pool', 'gym'] })
  @ValidateIf(sent)
  @IsArray({ message: 'Amenities must be a list' })
  @IsString({ each: true, message: 'Each amenity must be text' })
  amenities?: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    description:
      'Photo URLs (maximum 5). Only photos uploaded through the platform (GEN-08, /api/uploads/hotel/...) are accepted; outside links are rejected.',
    example: ['/api/uploads/hotel/0b8e6f1c-3b52-4c8e-9a41-5f6a9c1d2e33.jpg'],
  })
  @ValidateIf(sent)
  @IsArray({ message: 'Images must be a list' })
  @ArrayMaxSize(5, { message: 'A hotel can have at most 5 images' })
  @IsString({ each: true, message: 'Each image must be text' })
  images?: string[];
}
