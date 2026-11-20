import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { AccountStatus, User, UserDocument } from '../users/schemas/user.schema';
import { MailService } from '../mail/mail.service';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * ACC-02: after registration the user gets a verification link by email; booking is blocked
 * (JwtAuthGuard + @RequireVerifiedEmail) until the link is opened. Only the SHA-256 of the token is stored. */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private mail: MailService,
  ) {}

  /** Creates a new token (the old link stops working) and emails the link. Never throws. */
  async sendVerificationEmail(userId: string | Types.ObjectId): Promise<boolean> {
    try {
      const token = randomBytes(32).toString('hex');
      const user = await this.userModel
        .findOneAndUpdate(
          { _id: userId, emailVerified: false },
          {
            $set: {
              emailVerificationTokenHash: hashToken(token),
              emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
            },
          },
          { returnDocument: 'after' },
        )
        .select('email firstName');
      if (!user) {
        return false;
      }

      return await this.mail.send({
        to: user.email,
        subject: 'Verify your email address',
        text:
          `Hi ${user.firstName},\n\n` +
          'Please confirm your email address to start booking hotels and flights. This link is valid for 24 hours.',
        action: { label: 'Verify my email', url: `${this.mail.appUrl}/verify-email?token=${token}` },
      });
    } catch (err) {
      this.logger.error(`Verification email could not be prepared: ${(err as Error).message}`);
      return false;
    }
  }

  /** The link works once: the token is removed when the email is verified. */
  async verify(token: string) {
    const user = await this.userModel.findOneAndUpdate(
      {
        emailVerificationTokenHash: hashToken(token),
        emailVerificationExpiresAt: { $gt: new Date() },
      },
      {
        $set: { emailVerified: true },
        $unset: { emailVerificationTokenHash: '', emailVerificationExpiresAt: '' },
      },
    );
    if (!user) {
      throw new BadRequestException('This verification link is invalid or has expired');
    }
    return { message: 'Email verified' };
  }

  /** The logged-in user asks for a new link (e.g. the old one expired). */
  async resend(userId: string) {
    const user = await this.userModel.findById(userId).select('status emailVerified');
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Not authenticated');
    }
    if (user.emailVerified !== false) {
      throw new ConflictException('Your email address is already verified');
    }

    await this.sendVerificationEmail(user._id);
    return { message: 'Verification email sent' };
  }
}