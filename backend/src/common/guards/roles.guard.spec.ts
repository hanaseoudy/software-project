import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/schemas/user.schema';
import { RolesGuard } from './roles.guard';

const contextWith = (user?: { id: string; role: UserRole }) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows routes without role metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('rejects unauthenticated requests with 401', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(contextWith())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a user with the wrong role with 403', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    expect(() =>
      guard.canActivate(contextWith({ id: '1', role: UserRole.USER })),
    ).toThrow(ForbiddenException);
  });

  it('allows a user with a permitted role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);
    expect(
      guard.canActivate(contextWith({ id: '1', role: UserRole.ADMIN })),
    ).toBe(true);
  });
});
