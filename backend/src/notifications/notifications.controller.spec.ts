import { NotificationsController } from './notifications.controller';

describe('NotificationsController (GEN-01)', () => {
  const service = {
    findAll: jest.fn(), getUnreadCount: jest.fn(), markAsRead: jest.fn(), markAllAsRead: jest.fn(),
  };
  const controller = new NotificationsController(service as never);
  const req = { user: { sub: 'user-1', role: 'USER', sid: 's' } } as never;

  it('lists only the logged-in user notifications with page and unreadOnly', () => {
    controller.findAll(req, { page: 3, unreadOnly: true });
    expect(service.findAll).toHaveBeenCalledWith('user-1', { page: 3, unreadOnly: true });
    controller.findAll(req, {});
    expect(service.findAll).toHaveBeenLastCalledWith('user-1', { page: 1, unreadOnly: false });
  });

  it('returns the unread count for the logged-in user', () => {
    controller.getUnreadCount(req);
    expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
  });

  it('marks one or all of the user own notifications as read', () => {
    controller.markAsRead(req, 'n-1');
    expect(service.markAsRead).toHaveBeenCalledWith('user-1', 'n-1');
    controller.markAllAsRead(req);
    expect(service.markAllAsRead).toHaveBeenCalledWith('user-1');
  });
});
