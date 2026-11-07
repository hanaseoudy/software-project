import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({ example: '6aef52048e9d356647b49fdc' })
  id!: string;

  @ApiProperty({ example: 'Nour' })
  firstName!: string;

  @ApiProperty({ example: 'Hossam' })
  lastName!: string;

  @ApiProperty({ example: 'nour@example.com' })
  email!: string;

  @ApiProperty({ example: 'user' })
  role!: string;
}