import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { BookingType } from '../payments/enums/payment.enums';
import { PoliciesService } from './policies.service';

@ApiTags('Payments & Policies')
@Controller('bookings')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  // TODO (when the auth module exists): add the JWT auth guard + registered-user role guard
  // to this controller. Until then, requests without req.user get 401.
  private getUserId(req: any): string {
    const id = req.user?.userId ?? req.user?.id ?? req.user?._id;
    if (!id) throw new UnauthorizedException('Authentication required');
    return String(id);
  }

  @Get(':type/:id/policies')
  @ApiOperation({ summary: 'PAY-02: show the provider policies for a booking' })
  @ApiParam({ name: 'type', enum: BookingType })
  getPolicies(
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.policiesService.getPolicies(type, id, this.getUserId(req));
  }

  @Post(':type/:id/accept-policies')
  @ApiOperation({ summary: 'PAY-02: accept the provider policies (timestamp is stored)' })
  @ApiParam({ name: 'type', enum: BookingType })
  acceptPolicies(
    @Param('type', new ParseEnumPipe(BookingType)) type: BookingType,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.policiesService.acceptPolicies(type, id, this.getUserId(req));
  }
}
