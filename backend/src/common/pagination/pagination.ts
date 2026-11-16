import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';

// GEN-05: every list uses a fixed page size of 10
export const PAGE_SIZE = 10;

// GEN-02: one clear field-level message per invalid page value.
// Above MAX_SAFE_INTEGER numbers are no longer exact integers and the database skip would overflow.
const IsPageNumber = () =>
  ValidateBy({
    name: 'isPageNumber',
    validator: {
      validate: (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1,
      defaultMessage: (args) => {
        const value = args?.value;
        if (!Number.isInteger(value)) return 'Page must be a whole number';
        if ((value as number) < 1) return 'Page must be at least 1';
        return 'Page is too large';
      },
    },
  });

export class PaginationQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Page number (page size is fixed at 10)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsPageNumber()
  page?: number = 1;
}

export function skipFor(page: number) {
  return (page - 1) * PAGE_SIZE;
}

export function paginate<T>(items: T[], total: number, page: number) {
  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

// GEN-05: shape of every paginated response (documented in Swagger)
export class PaginatedResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'Up to 10 items of the current page' })
  items: unknown[];

  @ApiProperty({ example: 42, description: 'Total number of items' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: PAGE_SIZE, description: 'Always 10' })
  pageSize: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}
