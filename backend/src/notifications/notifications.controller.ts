import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // TODO (when the auth module exists): add the JWT auth guard to this controller.
  // Until then, requests without req.user get 401.
  private getUserId(req: any): string {
    const id = req.user?.userId ?? req.user?.id ?? req.user?._id;
    if (!id) throw new UnauthorizedException('Authentication required');
    return String(id);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('unreadOnly', new DefaultValuePipe(false), ParseBoolPipe) unreadOnly: boolean,
  ) {
    return this.notificationsService.findAll(this.getUserId(req), { page, limit, unreadOnly });
  }

  @Get('unread-count')
  getUnreadCount(@Req() req: any) {
    return this.notificationsService.getUnreadCount(this.getUserId(req));
  }

  @Patch('read-all')
  markAllAsRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(this.getUserId(req));
  }

  @Patch(':id/read')
  markAsRead(@Req() req: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(this.getUserId(req), id);
  }
}
