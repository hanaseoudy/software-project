import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'Reset1234',
    minLength: 8,
    maxLength: 72,
    description: 'Temporary password set by the admin; the account must change it at its next login',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @IsByteLength(0, 72, { message: 'Password must be at most 72 bytes' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Password must contain at least one letter and one digit' })
  temporaryPassword!: string;
}