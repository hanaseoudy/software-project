import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

// The logged-in user object may store the id under different names.
const getUserId = (user: any): string =>
  String(user?.userId ?? user?.sub ?? user?._id ?? user?.id);

@ApiTags('Notifications')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // GEN-01: notification list
  @Get()
  @ApiOperation({ summary: 'List my notifications (GEN-01)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.findAll(getUserId(user), {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  // GEN-01: unread count
  @Get('unread-count')
  @ApiOperation({ summary: 'Get my unread notification count (GEN-01)' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(getUserId(user));
  }

  // GEN-01: mark all as read
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read (GEN-01)' })
  markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(getUserId(user));
  }

  // GEN-01: mark one as read
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read (GEN-01)' })
  markAsRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(getUserId(user), id);
  }
}
