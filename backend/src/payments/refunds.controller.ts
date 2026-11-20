import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { Roles } from '../common/decorators/roles.decorator';
import { type AuthenticatedRequest, JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { RefundResponseDto } from './dto/refund-response.dto';
import { RefundsService } from './refunds.service';

@ApiTags('Payments')
@ApiCookieAuth(ACCESS_COOKIE)
@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get(':id')
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'Get refund status (PAY-03)',
    description: 'Own refund only. Status is Pending, Refunded or Failed.',
  })
  @ApiOkResponse({ type: RefundResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not a registered user' })
  @ApiNotFoundResponse({ description: 'Refund not found' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<RefundResponseDto> {
    return this.refundsService.findOne(req.user!.sub, id);
  }
}
