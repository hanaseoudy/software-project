import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { AccountStatus, UserRole } from '../../users/schemas/user.schema';

export class ListAccountsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'nour',
    description: 'Search by first name, last name or email (case-insensitive, every word must match)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Search must be text' })
  @MaxLength(100, { message: 'Search must be at most 100 characters' })
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole, { message: `Role must be one of: ${Object.values(UserRole).join(', ')}` })
  role?: UserRole;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus, { message: `Status must be one of: ${Object.values(AccountStatus).join(', ')}` })
  status?: AccountStatus;
}