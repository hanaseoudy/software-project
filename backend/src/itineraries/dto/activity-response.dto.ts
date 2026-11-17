import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityDocument } from '../schemas/activity.schema';

export class ActivityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() dayId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ example: '14:30' }) time?: string;
  @ApiPropertyOptional({ minimum: 0 }) cost?: number;
  @ApiPropertyOptional({ example: 'USD' }) currency?: string;
  @ApiProperty({ type: [String] }) images!: string[];

  static from(activity: ActivityDocument): ActivityResponseDto {
    return {
      id: activity._id.toString(),
      dayId: activity.dayId.toString(),
      name: activity.name,
      description: activity.description,
      ...(activity.time != null ? { time: activity.time } : {}),
      ...(activity.cost != null ? { cost: activity.cost } : {}),
      ...(activity.currency != null ? { currency: activity.currency } : {}),
      images: [...activity.images],
    };
  }
}
