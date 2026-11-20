import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

// GEN-01: every route only reads or updates the logged-in user's own notifications.
@ApiTags('notifications')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 401, description: 'Not authenticated' })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications, newest first, with the unread count (GEN-01)' })
  @ApiOkResponse({ description: '{ data, total, unreadCount, page, limit, totalPages }' })
  @ApiResponse({ status: 400, description: 'Invalid page or unreadOnly value' })
  findAll(@Req() req: AuthenticatedRequest, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.findAll(req.user!.sub, {
      page: query.page ?? 1,
      unreadOnly: query.unreadOnly ?? false,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get my unread notification count (GEN-01)' })
  @ApiOkResponse({ description: '{ unreadCount }' })
  getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(req.user!.sub);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read (GEN-01)' })
  @ApiOkResponse({ description: '{ updated }: number of notifications marked as read' })
  markAllAsRead(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user!.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one of my notifications as read (GEN-01)' })
  @ApiParam({ name: 'id', description: 'Notification MongoDB ObjectId' })
  @ApiOkResponse({ description: 'The updated notification' })
  @ApiResponse({ status: 400, description: 'Invalid notification id' })
  @ApiResponse({ status: 404, description: 'Notification not found (or not yours)' })
  markAsRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user!.sub, id);
  }
}
