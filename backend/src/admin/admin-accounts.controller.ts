import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { AdminAccountsService } from './admin-accounts.service';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';

@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/accounts')
export class AdminAccountsController {
  constructor(private accountsService: AdminAccountsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all accounts with search and filters (ACC-14)',
    description:
      'Newest first, 10 per page (GEN-05). search matches first name, last name or email; role and status filter exactly. Filters can be combined.',
  })
  @ApiOkResponse({
    description: 'One page of accounts',
    schema: {
      example: {
        items: [
          {
            id: '6aef52048e9d356647b49fdc',
            firstName: 'Nour',
            lastName: 'Hossam',
            email: 'nour@example.com',
            role: 'user',
            status: 'active',
            registeredAt: '2026-11-10T09:30:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid page, role or status',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { role: ['Role must be one of: user, moderator, admin'] } },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not an admin',
    example: { message: 'You do not have permission to perform this action', error: 'Forbidden', statusCode: 403 },
  })
  listAccounts(@Query() query: ListAccountsQueryDto) {
    return this.accountsService.listAccounts(query);
  }
}