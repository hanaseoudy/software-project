// common/guards/roles.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import type { AuthenticatedRequest } from './jwt-auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const allowed = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) return true; // no @Roles() on this route, so any logged-in user may enter

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !allowed.includes(user.role as Role)) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
