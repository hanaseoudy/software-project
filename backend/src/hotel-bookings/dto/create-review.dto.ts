import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// HTL-23: review text limit from the requirement sheet
export const REVIEW_COMMENT_MAX_LENGTH = 1000;

// Trimmed; an empty or whitespace-only comment counts as no comment
const trimToOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  return text === '' ? undefined : text;
};

// HTL-23: POST /api/hotel-bookings/:id/review
export class CreateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Whole number from 1 to 5' })
  @IsInt({ message: 'Rating must be a whole number from 1 to 5' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must be at most 5' })
  rating!: number;

  @ApiPropertyOptional({
    example: 'Clean rooms and friendly staff.',
    maxLength: REVIEW_COMMENT_MAX_LENGTH,
    description: 'Optional review text, trimmed; an empty text is treated as no review text',
  })
  @IsOptional()
  @Transform(trimToOptional)
  @IsString({ message: 'Comment must be text' })
  @MaxLength(REVIEW_COMMENT_MAX_LENGTH, { message: `Comment must be at most ${REVIEW_COMMENT_MAX_LENGTH} characters` })
  comment?: string;
}
