import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// BLG-09: GET /api/posts/search?q=<keyword>&page=<n>
export class SearchPostsQueryDto {
  @ApiProperty({
    example: 'luxor',
    minLength: 1,
    maxLength: 100,
    description: 'Keyword matched in the title, tags or author name (case-insensitive)',
  })
  @Transform(trim)
  @IsString({ message: 'Search keyword must be text' })
  @IsNotEmpty({ message: 'Search keyword is required' })
  @MaxLength(100, { message: 'Search keyword must be at most 100 characters' })
  q!: string;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1, description: 'Page number (10 results per page)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be a whole number' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;
}
