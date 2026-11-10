import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../../auth/auth.cookies';

export interface AuthPayload {
  sub: string;
  role: string;
}

export type AuthenticatedRequest = Request & { user?: AuthPayload };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[ACCESS_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    try {
      request.user = await this.jwtService.verifyAsync<AuthPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Not authenticated');
    }

    return true;
  }
}