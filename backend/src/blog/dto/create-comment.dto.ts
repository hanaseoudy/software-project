import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import { COMMENT_MAX_LENGTH, commentTextError } from '../comment-rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// BLG-05: comment on a published post, non-empty and at most 500 characters (one message per error, GEN-02)
export class CreateCommentDto {
  @ApiProperty({ example: 'Great tips, thanks!', minLength: 1, maxLength: COMMENT_MAX_LENGTH })
  @Transform(trim)
  @ValidateBy({
    name: 'isCommentText',
    validator: {
      validate: (value: unknown) => commentTextError(value) === null,
      defaultMessage: (args) => commentTextError(args?.value) ?? 'Invalid comment',
    },
  })
  text!: string;
}
