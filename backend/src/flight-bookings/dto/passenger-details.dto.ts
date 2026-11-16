import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { DocumentType, PassengerType } from '../schemas/passenger.schema';
import { isPastCalendarDate } from '../utils/birth-date';

function IsPastCalendarDate(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isPastCalendarDate',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'dateOfBirth must be a real date in YYYY-MM-DD format and not in the future',
        ...options,
      },
      validator: { validate: (value: unknown) => isPastCalendarDate(value) },
    });
  };
}

export class ExtraBagDto {
  @ApiProperty({
    example: 20,
    description: 'Weight of this extra bag in kg (> 0)',
  })
  @IsNumber()
  @Min(0.1)
  weightKg: number;
}

export class PassengerDetailsDto {
  @ApiProperty({ example: 'Mariam' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @ApiProperty({ example: 'Mashoud' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @ApiProperty({ enum: PassengerType, example: PassengerType.ADULT })
  @IsEnum(PassengerType)
  type: PassengerType;

  @ApiProperty({ example: '1999-05-20', description: 'YYYY-MM-DD' })
  @IsPastCalendarDate()
  dateOfBirth: string;

  @ApiProperty({ enum: DocumentType, example: DocumentType.PASSPORT })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiProperty({
    example: 'A12345678',
    description: 'Passport or national ID number',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{5,20}$/, {
    message: 'documentNumber must be 5-20 letters, digits or dashes',
  })
  documentNumber: string;

  @ApiPropertyOptional({
    type: [ExtraBagDto],
    description: 'Optional extra bags for this passenger',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExtraBagDto)
  extraBags?: ExtraBagDto[];
}
