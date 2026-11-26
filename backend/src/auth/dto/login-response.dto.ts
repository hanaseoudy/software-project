import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ example: '6aef52048e9d356647b49fdc' })
  id!: string;

  @ApiProperty({ example: 'Nour' })
  firstName!: string;

  @ApiProperty({ example: 'Hossam' })
  lastName!: string;

  @ApiProperty({ example: 'nour@example.com' })
  email!: string;

  @ApiProperty({ example: 'user', enum: ['user', 'moderator', 'admin'] })
  role!: string;

  @ApiPropertyOptional({
    example: null,
    enum: ['hotel', 'airline'],
    nullable: true,
    description: 'Set only for moderators; tells the frontend which moderator home page to open',
  })
  providerType!: string | null;

  @ApiProperty({
    type: String,
    example: null,
    nullable: true,
    description:
      'BE-2: id of the airline or hotel the moderator manages (matches providerType); null for users and admins',
  })
  providerId!: string | null;

  @ApiProperty({ example: false, description: 'True when the user must change a temporary password (ACC-13)' })
  mustChangePassword!: boolean;

  @ApiProperty({ example: true, description: 'False until the user opens the link in the verification email; booking is blocked until then (ACC-02)' })
  emailVerified!: boolean;
}