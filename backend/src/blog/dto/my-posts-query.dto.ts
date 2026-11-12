import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

// GEN-05: lists use a fixed page size of 10, so only the page number is accepted
export class MyPostsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number (page size is fixed at 10)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be a whole number' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;
}
