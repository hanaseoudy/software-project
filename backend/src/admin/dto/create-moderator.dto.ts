import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsByteLength, IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ProviderType } from '../../users/schemas/moderatorassignment.schema';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateModeratorDto {
  @ApiProperty({ example: 'Sara' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @ApiProperty({ example: 'Ali' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @ApiProperty({ example: 'sara@nilepalace.com', description: 'Must be valid and not already registered' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email is invalid' })
  email!: string;

  @ApiProperty({
    example: 'Temp1234',
    minLength: 8,
    maxLength: 72,
    description: 'Temporary password set by the admin; the moderator must change it on first login',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @IsByteLength(0, 72, { message: 'Password must be at most 72 bytes' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Password must contain at least one letter and one digit' })
  temporaryPassword!: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.HOTEL, description: 'hotel or airline moderator' })
  @IsEnum(ProviderType, { message: 'Provider type must be hotel or airline' })
  providerType!: ProviderType;

  @ApiProperty({ example: '6aef52048e9d356647b49fdc', description: 'The hotel or airline this moderator manages' })
  @IsMongoId({ message: 'Provider ID is invalid' })
  providerId!: string;
}