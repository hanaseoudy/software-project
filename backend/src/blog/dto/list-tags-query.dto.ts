import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';

export class ListTagsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'ro', description: 'Search tags by text' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  search?: string;
}
