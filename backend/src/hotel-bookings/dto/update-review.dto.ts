import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { REVIEW_COMMENT_MAX_LENGTH } from './create-review.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// HTL-23: PATCH /api/reviews/:id. Only the fields sent are changed; at least one is required.
export class UpdateReviewDto {
  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5, description: 'Whole number from 1 to 5' })
  @IsOptional()
  @IsInt({ message: 'Rating must be a whole number from 1 to 5' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must be at most 5' })
  rating?: number;

  @ApiPropertyOptional({
    example: 'Updated: the breakfast was great too.',
    maxLength: REVIEW_COMMENT_MAX_LENGTH,
    nullable: true,
    type: String,
    description: 'New review text (1 to 1000 characters after trimming), or null to remove it',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Comment must be text' })
  @IsNotEmpty({ message: 'Comment cannot be empty; send null to remove it' })
  @MaxLength(REVIEW_COMMENT_MAX_LENGTH, { message: `Comment must be at most ${REVIEW_COMMENT_MAX_LENGTH} characters` })
  comment?: string | null;
}
