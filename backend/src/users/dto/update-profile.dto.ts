import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { SupportedCurrency } from '../schemas/user.schema';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const isSent = (_: object, value: unknown) => value !== undefined;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nour' })
  @ValidateIf(isSent)
  @Transform(trim)
  @IsString({ message: 'First name must be text' })
  @IsNotEmpty({ message: 'First name cannot be empty' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Hossam' })
  @ValidateIf(isSent)
  @Transform(trim)
  @IsString({ message: 'Last name must be text' })
  @IsNotEmpty({ message: 'Last name cannot be empty' })
  lastName?: string;

  @ApiPropertyOptional({
    example: '+201001234567',
    nullable: true,
    description: '7 to 15 digits, may start with +; spaces and dashes are removed; send null to remove it',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value))
  @Matches(/^\+?\d{7,15}$/, { message: 'Phone number must be 7 to 15 digits and may start with +' })
  phoneNumber?: string | null;

  @ApiPropertyOptional({ enum: SupportedCurrency, example: SupportedCurrency.USD })
  @ValidateIf(isSent)
  @IsEnum(SupportedCurrency, {
    message: `Preferred currency must be one of: ${Object.values(SupportedCurrency).join(', ')}`,
  })
  preferredCurrency?: SupportedCurrency;
}