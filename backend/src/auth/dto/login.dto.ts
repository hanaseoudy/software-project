import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'nour@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email is invalid' })
  email!: string;

  @ApiProperty({ example: 'hello123' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}