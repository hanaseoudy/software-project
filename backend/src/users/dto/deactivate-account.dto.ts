import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** ACC-12: the user confirms the deactivation by typing their current password. */
export class DeactivateAccountDto {
  @ApiProperty({ example: 'MyPass123', description: 'Current password, to confirm the deactivation' })
  @IsString({ message: 'Password must be text' })
  @IsNotEmpty({ message: 'Password is required to confirm' })
  password: string;
}