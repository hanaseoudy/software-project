import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// BLG-08: validates the :tag route parameter (trimmed, lowercase, 1-30 characters)
export class TagParamDto {
  @ApiProperty({ example: 'rome', minLength: 1, maxLength: 30 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Tag must not be empty' })
  @MaxLength(30, { message: 'Tag must be at most 30 characters' })
  tag: string;
}
