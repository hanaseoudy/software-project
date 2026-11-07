import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsByteLength, IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Nour' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @ApiProperty({ example: 'Hossam' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @ApiProperty({ example: 'nour@example.com', description: 'Must be valid and not already registered' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email is invalid' })
  email!: string;

  @ApiProperty({
    example: 'hello123',
    minLength: 8,
    maxLength: 72,
    description: 'At least 8 characters with at least one letter and one digit; at most 72 bytes',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @IsByteLength(0, 72, { message: 'Password must be at most 72 bytes' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Password must contain at least one letter and one digit' })
  password!: string;

  @ApiProperty({ example: true, description: 'Terms-and-privacy consent; must be true' })
  @IsBoolean({ message: 'You must accept the terms and privacy policy' })
  @Equals(true, { message: 'You must accept the terms and privacy policy' })
  acceptTerms!: boolean;
}