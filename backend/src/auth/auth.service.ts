import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { AccountStatus, User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { ModeratorAssignment, ModeratorAssignmentDocument } from '../users/schemas/moderatorassignment.schema';
import { Session, SessionDocument } from './schemas/session.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  authCookieOptions,
  clearCookieOptions,
} from './auth.cookies';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

interface RefreshPayload {
  sub: string;
  sid: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ModeratorAssignment.name) private assignmentModel: Model<ModeratorAssignmentDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userModel.exists({ email: dto.email });
    if (exists) {
      throw this.emailTaken();
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const user = await this.userModel.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        termsAcceptedAt: new Date(),
      });

      return {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      };
    } catch (err: any) {
      if (err?.code === 11000) {
        throw this.emailTaken();
      }
      throw err;
    }
  }



    async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select('+passwordHash +failedLoginAttempts +lockedUntil');

    // ACC-05: a locked account is rejected before the password is checked.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw this.accountLocked(user.lockedUntil);
    }

    const passwordOk = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !passwordOk) {
      if (user) {
        await this.recordFailedLogin(user);
      }
      throw this.invalidCredentials();
    }

    if (user.status === AccountStatus.SUSPENDED) {
      throw new ForbiddenException('Account suspended');
    }

    if (user.status === AccountStatus.DEACTIVATED) {
      throw this.invalidCredentials();
    }

    // ACC-05: a successful login resets the counter.
    if (user.failedLoginAttempts || user.lockedUntil) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { failedLoginAttempts: 0, lockedUntil: null } },
      );
    }

    const session = await this.sessionModel.create({
      user: user._id,
      refreshJti: randomUUID(),
      lastActivityAt: new Date(),
      expiresAt: this.refreshExpiry(),
    });
    const tokens = await this.signTokens(session, user);

    return { user: await this.toAuthUser(user), ...tokens };
  }

  
async refresh(refreshToken: string | undefined) {
  if (!refreshToken) {
    throw this.notAuthenticated();
  }

  let payload: RefreshPayload;

  try {
    payload = await this.jwtService.verifyAsync<RefreshPayload>(
      refreshToken,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      },
    );
  } catch {
    throw this.notAuthenticated();
  }

  const user = await this.userModel.findById(payload.sub);

  if (!user || user.status !== AccountStatus.ACTIVE) {
    await this.revokeSession(payload.sid);
    throw this.notAuthenticated();
  }

  const now = new Date();

  // Atomically check and rotate the refresh token.
  const session = await this.sessionModel.findOneAndUpdate(
    {
      _id: payload.sid,
      user: payload.sub,
      refreshJti: payload.jti,
      revokedAt: null,
      expiresAt: { $gt: now },
      lastActivityAt: {
        $gt: new Date(now.getTime() - this.idleTtl() * 1000),
      },
    },
    {
      $set: {
        refreshJti: randomUUID(),
        expiresAt: this.refreshExpiry(),
      },
    },
    { returnDocument: 'after' },
  );

  if (!session) {
    // Invalid, expired, idle, revoked, or reused refresh token.
    await this.revokeSession(payload.sid);
    throw this.notAuthenticated();
  }

  const tokens = await this.signTokens(session, user);

  return {
    user: await this.toAuthUser(user),
    ...tokens,
  };
}


  async logout(accessToken: string | undefined, refreshToken: string | undefined) {
    const sessionId =
      (await this.readSessionId(accessToken, 'JWT_ACCESS_SECRET')) ??
      (await this.readSessionId(refreshToken, 'JWT_REFRESH_SECRET'));

    if (sessionId) {
      await this.sessionModel.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw this.notAuthenticated();
    }
    return this.toAuthUser(user);
  }

  /** ACC-08: change the password after checking the current one; other sessions are logged out. */
  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw this.notAuthenticated();
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw this.passwordError('currentPassword', 'Current password is incorrect');
    }

    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw this.passwordError('newPassword', 'New password must be different from the current password');
    }

    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await bcrypt.hash(dto.newPassword, 10), mustChangePassword: false } },
    );

    await this.sessionModel.updateMany(
      { user: user._id, _id: { $ne: sessionId }, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );

    return { message: 'Password changed' };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie(ACCESS_COOKIE, accessToken, authCookieOptions(this.accessTtl()));
    res.cookie(REFRESH_COOKIE, refreshToken, authCookieOptions(this.refreshTtl(), REFRESH_COOKIE_PATH));
  }

  clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, clearCookieOptions());
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions(REFRESH_COOKIE_PATH));
  }

  private async signTokens(session: SessionDocument, user: UserDocument) {
    const sub = user._id.toString();
    const sid = session._id.toString();

    const accessToken = await this.jwtService.signAsync(
      { sub, role: user.role, sid },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: this.accessTtl() },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub, sid, jti: session.refreshJti },
      { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl() },
    );

    return { accessToken, refreshToken };
  }

  private async readSessionId(token: string | undefined, secretKey: string) {
    if (!token) {
      return null;
    }
    try {
      const payload = await this.jwtService.verifyAsync<{ sid?: string }>(token, {
        secret: this.config.getOrThrow<string>(secretKey),
        ignoreExpiration: true,
      });
      return payload.sid ?? null;
    } catch {
      return null;
    }
  }

  private async toAuthUser(user: UserDocument) {
    let providerType: string | null = null;
    if (user.role === UserRole.MODERATOR) {
      const assignment = await this.assignmentModel.findOne({ moderatorId: user._id });
      providerType = assignment?.providerType ?? null;
    }

    return {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      providerType,
      mustChangePassword: user.mustChangePassword,
    };
  }


    /** ACC-05: count a failed login; the 5th consecutive failure locks the account for 15 minutes. */
  private async recordFailedLogin(user: UserDocument) {
    await this.userModel.updateOne({ _id: user._id }, { $inc: { failedLoginAttempts: 1 } });
    // Only matches once the count has reached 5, so concurrent failures lock exactly once.
    await this.userModel.updateOne(
      { _id: user._id, failedLoginAttempts: { $gte: MAX_FAILED_LOGINS } },
      {
        $set: {
          failedLoginAttempts: 0,
          lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
        },
      },
    );
  }

  private async revokeSession(sessionId: string) {
    await this.sessionModel.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  private accountLocked(lockedUntil: Date) {
    const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));
    return new HttpException(
      {
        statusCode: HttpStatus.LOCKED,
        message: `Account locked after too many failed login attempts. Try again in ${minutes} minute(s).`,
        error: 'Locked',
      },
      HttpStatus.LOCKED,
    );
  }

  private refreshExpiry() {
    return new Date(Date.now() + this.refreshTtl() * 1000);
  }

  private accessTtl() {
    return Number(this.config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
  }

  private refreshTtl() {
    return Number(this.config.get('JWT_REFRESH_TTL_SECONDS') ?? 1800);
  }

  private idleTtl() {
    return Number(this.config.get('SESSION_IDLE_TIMEOUT_SECONDS') ?? 1800);
  }

  private emailTaken() {
    return new ConflictException({
      message: 'Validation failed',
      errors: { email: ['Email is already registered'] },
    });
  }

  private passwordError(field: string, message: string) {
    return new BadRequestException({
      message: 'Validation failed',
      errors: { [field]: [message] },
    });
  }

  private invalidCredentials() {
    return new UnauthorizedException('Invalid email or password');
  }

  private notAuthenticated() {
    return new UnauthorizedException('Not authenticated');
  }
}