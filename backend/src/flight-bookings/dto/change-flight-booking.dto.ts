import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';

/** FLT-27: the new flight(s). Leave a leg out to keep it as it is. */
export class ChangeFlightQueryDto {
  @ApiPropertyOptional({
    description:
      'New outbound flight id (same route and cabin as the booked one)',
    example: '665f1c2e8b3c4a0012345678',
  })
  @IsOptional()
  @IsMongoId({ message: 'Outbound flight ID must be a valid ID' })
  outboundFlightId?: string;

  @ApiPropertyOptional({
    description: 'New return flight id (round trips only)',
    example: '665f1c2e8b3c4a0012345679',
  })
  @IsOptional()
  @IsMongoId({ message: 'Return flight ID must be a valid ID' })
  returnFlightId?: string;
}

export class ChangeFlightBookingDto extends ChangeFlightQueryDto {
  @ApiProperty({
    description:
      'Must be true: the user confirms after seeing the fare difference',
    example: true,
  })
  @IsBoolean({ message: 'Confirm must be true or false' })
  confirm!: boolean;
}
