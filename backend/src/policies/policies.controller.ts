import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, type AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { BookingType } from '../payments/enums/payment.enums';
import { PoliciesService } from './policies.service';

@ApiTags('Payments & Policies')
@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get(':type/:id/policies')
  @ApiOperation({ summary: 'PAY-02: show the provider policies for a booking' })
  @ApiParam({ name: 'type', enum: BookingType })
  getPolicies(
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.policiesService.getPolicies(type, id, req.user!.sub);
  }

  @Post(':type/:id/accept-policies')
  @ApiOperation({ summary: 'PAY-02: accept the provider policies (timestamp is stored)' })
  @ApiParam({ name: 'type', enum: BookingType })
  acceptPolicies(
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.policiesService.acceptPolicies(type, id, req.user!.sub);
  }
}
