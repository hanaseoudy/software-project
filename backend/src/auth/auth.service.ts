import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { AccountStatus, User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { ModeratorAssignment, ModeratorAssignmentDocument } from '../users/schemas/moderatorassignment.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_COOKIE_PATH, authCookieOptions } from './auth.cookies';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ModeratorAssignment.name) private assignmentModel: Model<ModeratorAssignmentDocument>,
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
    const user = await this.userModel.findOne({ email: dto.email }).select('+passwordHash');
    const passwordOk = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;

    if (!user || !passwordOk) {
      throw this.invalidCredentials();
    }

    if (user.status === AccountStatus.SUSPENDED) {
      throw new ForbiddenException('Account suspended');
    }

    if (user.status === AccountStatus.DEACTIVATED) {
      throw this.invalidCredentials();
    }

    const sub = user._id.toString();
    const accessToken = await this.jwtService.signAsync(
      { sub, role: user.role },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: this.accessTtl() },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub },
      { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl() },
    );

    return { user: await this.toAuthUser(user), accessToken, refreshToken };
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.toAuthUser(user);
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie(ACCESS_COOKIE, accessToken, authCookieOptions(this.accessTtl()));
    res.cookie(REFRESH_COOKIE, refreshToken, authCookieOptions(this.refreshTtl(), REFRESH_COOKIE_PATH));
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

  private accessTtl() {
    return Number(this.config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
  }

  private refreshTtl() {
    return Number(this.config.get('JWT_REFRESH_TTL_SECONDS') ?? 1800);
  }

  private emailTaken() {
    return new ConflictException({
      message: 'Validation failed',
      errors: { email: ['Email is already registered'] },
    });
  }

  private invalidCredentials() {
    return new UnauthorizedException('Invalid email or password');
  }
}