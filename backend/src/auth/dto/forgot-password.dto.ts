import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

/** ACC-07: the email of the account whose password was forgotten. */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'nour@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email is invalid' })
  email!: string;
}