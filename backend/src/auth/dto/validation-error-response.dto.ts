import { ApiProperty } from '@nestjs/swagger';

export class ValidationErrorResponseDto {
  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description: 'Error messages grouped by field name',
  })
  errors!: Record<string, string[]>;
}