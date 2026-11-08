import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/schemas/user.schema';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

class TestController {
  @Roles(UserRole.ADMIN)
  adminOnly() {}

  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  staffOnly() {}

  open() {}
}

@Roles(UserRole.ADMIN)
class AdminController {
  anything() {}

  @Roles(UserRole.MODERATOR)
  moderatorOverride() {}
}

function contextFor(
  controller: new () => object,
  handler: (...args: never[]) => unknown,
  user?: { sub: string; role: string },
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard (GEN-13)', () => {
  const guard = new RolesGuard(new Reflector());
  const user = (role: UserRole) => ({ sub: '507f1f77bcf86cd799439011', role });

  it('allows any authenticated user when no roles are required', () => {
    expect(guard.canActivate(contextFor(TestController, TestController.prototype.open, user(UserRole.USER)))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    expect(guard.canActivate(contextFor(TestController, TestController.prototype.adminOnly, user(UserRole.ADMIN)))).toBe(true);
    expect(guard.canActivate(contextFor(TestController, TestController.prototype.staffOnly, user(UserRole.MODERATOR)))).toBe(true);
  });

  it('rejects a user whose role is not listed with 403', () => {
    expect(() =>
      guard.canActivate(contextFor(TestController, TestController.prototype.adminOnly, user(UserRole.USER))),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor(TestController, TestController.prototype.adminOnly, user(UserRole.MODERATOR))),
    ).toThrow(ForbiddenException);
  });

  it('rejects a request with no authenticated user with 401', () => {
    expect(() => guard.canActivate(contextFor(TestController, TestController.prototype.adminOnly))).toThrow(
      UnauthorizedException,
    );
  });

  it('applies roles set on the controller class to every method', () => {
    expect(() =>
      guard.canActivate(contextFor(AdminController, AdminController.prototype.anything, user(UserRole.USER))),
    ).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor(AdminController, AdminController.prototype.anything, user(UserRole.ADMIN)))).toBe(true);
  });

  it('lets a method-level @Roles override the controller-level one', () => {
    expect(
      guard.canActivate(contextFor(AdminController, AdminController.prototype.moderatorOverride, user(UserRole.MODERATOR))),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(AdminController, AdminController.prototype.moderatorOverride, user(UserRole.ADMIN))),
    ).toThrow(ForbiddenException);
  });
});