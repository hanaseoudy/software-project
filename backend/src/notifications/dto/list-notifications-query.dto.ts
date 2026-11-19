import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

// GEN-01: notification list query (page size fixed at 10 by GEN-05)
export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean, default: false, description: 'Only return unread notifications' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'unreadOnly must be true or false' })
  unreadOnly?: boolean;
}
