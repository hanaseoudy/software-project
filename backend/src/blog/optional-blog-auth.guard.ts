import { ExecutionContext, Injectable } from '@nestjs/common';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';

// Published images are public; draft images still require their author's JWT.
@Injectable()
export class OptionalBlogAuthGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.cookies?.[ACCESS_COOKIE]) return true;
    return super.canActivate(context);
  }
}
