import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

// GEN-09: ?page=N (page size is fixed at 10)
export class ListReportsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1, description: 'Page number (10 per page)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be a whole number' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;
}
