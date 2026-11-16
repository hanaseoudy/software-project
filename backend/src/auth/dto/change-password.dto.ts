import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Temp1234', description: 'The password the user logs in with now' })
  @IsString({ message: 'Current password must be text' })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword!: string;

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