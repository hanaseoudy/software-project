import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveActivityImageQueryDto {
  @ApiProperty({ description: 'Exact URL in the activity images array' })
  @IsString()
  @IsNotEmpty()
  url!: string;
}

export class AttachedActivityImageDto {
  @ApiProperty({
    example: '/api/uploads/activity/680329ed-1150-49a5-b035-b0b7ef86424f.png',
  })
  url!: string;
}
