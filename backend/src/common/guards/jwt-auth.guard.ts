import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../../auth/auth.cookies';
import { Session, SessionDocument } from '../../auth/schemas/session.schema';
import { AccountStatus, User, UserDocument } from '../../users/schemas/user.schema';

export interface AuthPayload {
  sub: string;
  role: string;
  sid: string;
}

export type AuthenticatedRequest = Request & { user?: AuthPayload };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[ACCESS_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    let payload: AuthPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Not authenticated');
    }

    const idleSeconds = Number(this.config.get('SESSION_IDLE_TIMEOUT_SECONDS') ?? 1800);
    const now = new Date();
    const session = await this.sessionModel.findOneAndUpdate(
      {
        _id: payload.sid,
        user: payload.sub,
        revokedAt: null,
        expiresAt: { $gt: now },
        lastActivityAt: { $gt: new Date(now.getTime() - idleSeconds * 1000) },
      },
      { $set: { lastActivityAt: now } },
    );
    if (!session) {
      throw new UnauthorizedException('Not authenticated');
    }

    const user = await this.userModel.findById(payload.sub).select('status role').lean();
    if (!user || user.status !== AccountStatus.ACTIVE) {
      await this.sessionModel.updateOne({ _id: session._id }, { $set: { revokedAt: now } });
      throw new UnauthorizedException('Not authenticated');
    }
    request.user = { sub: payload.sub, sid: payload.sid, role: user.role };
    return true;
  }
}
