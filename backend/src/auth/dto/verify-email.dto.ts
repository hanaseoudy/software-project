import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** ACC-02: the token from the link in the verification email. */
export class VerifyEmailDto {
  @ApiProperty({ example: '3f9c1e…', description: 'The token from the verification link (?token=...)' })
  @IsString({ message: 'Token must be text' })
  @IsNotEmpty({ message: 'Token is required' })
  token: string;
}