import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

export class ListPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'rome', description: 'Filter by tag' })
  @IsOptional()
  @IsString()
  tag?: string;
}
