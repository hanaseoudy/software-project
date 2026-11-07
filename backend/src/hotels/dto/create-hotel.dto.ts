import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateHotelDto {
  @ApiProperty({ example: 'Nile Palace Hotel', minLength: 2, maxLength: 150 })
  @Transform(trim)
  @IsString({ message: 'Name is required' })
  @IsNotEmpty({ message: 'Name is required' })
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(150, { message: 'Name must be at most 150 characters' })
  name!: string;

  @ApiPropertyOptional({ example: 'A five-star hotel on the Nile corniche.' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Description must be text' })
  @MaxLength(3000, { message: 'Description must be at most 3000 characters' })
  description?: string;

  @ApiProperty({ example: '1 Corniche El Nil Street' })
  @Transform(trim)
  @IsString({ message: 'Address is required' })
  @IsNotEmpty({ message: 'Address is required' })
  address!: string;

  @ApiProperty({
    description: 'City id from the seeded reference data (GEN-12)',
    example: '675f1b2c9d3e4a0012345678',
  })
  @IsMongoId({ message: 'City must be a valid id' })
  city!: string;

  @ApiProperty({
    description: 'Country id from the seeded reference data (GEN-12)',
    example: '675f1b2c9d3e4a0087654321',
  })
  @IsMongoId({ message: 'Country must be a valid id' })
  country!: string;

  @ApiProperty({
    example: 5,
    minimum: 1,
    maximum: 5,
    description: 'Star class',
  })
  @IsInt({ message: 'Star rating must be a whole number between 1 and 5' })
  @Min(1, { message: 'Star rating must be at least 1' })
  @Max(5, { message: 'Star rating must be at most 5' })
  starRating!: number;

  @ApiPropertyOptional({ type: [String], example: ['wifi', 'pool', 'gym'] })
  @IsOptional()
  @IsArray({ message: 'Amenities must be a list' })
  @IsString({ each: true, message: 'Each amenity must be text' })
  amenities?: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    description: 'Photo URLs (maximum 5). File upload is handled by GEN-08.',
    example: ['https://example.com/hotel-1.jpg'],
  })
  @IsOptional()
  @IsArray({ message: 'Images must be a list' })
  @ArrayMaxSize(5, { message: 'A hotel can have at most 5 images' })
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  images?: string[];
}
