import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

/** ACC-07: the token from the reset email and the new password (same rules as registration). */
export class ResetPasswordWithTokenDto {
  @ApiProperty({ example: '3f9c1e…', description: 'The token from the reset link (?token=...)' })
  @IsString({ message: 'Token must be text' })
  @IsNotEmpty({ message: 'Token is required' })
  token!: string;

  @ApiProperty({
    example: 'NewPass123',
    minLength: 8,
    maxLength: 72,
    description: 'At least 8 characters with at least one letter and one digit; at most 72 bytes',
  })
  @IsString({ message: 'New password must be text' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @IsByteLength(0, 72, { message: 'Password must be at most 72 bytes' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Password must contain at least one letter and one digit' })
  newPassword!: string;
}