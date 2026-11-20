import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { AccountStatus, User, UserDocument } from '../users/schemas/user.schema';
import { Session, SessionDocument } from './schemas/session.schema';
import { MailService } from '../mail/mail.service';

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // ACC-07: 30 minutes

/** Same reply whether or not the email exists, so the response never reveals which emails are registered. */
export const FORGOT_PASSWORD_REPLY = {
  message: 'If an account exists for this email, a password reset link has been sent.',
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * ACC-07: email-based password recovery.
 * - The link expires after 30 minutes and works once.
 * - A newer request replaces the stored token, so older links stop working.
 * - Only the SHA-256 of the token is stored; the token itself is only in the email.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private mail: MailService,
  ) {}

  async requestReset(email: string) {
    const token = randomBytes(32).toString('hex');
    const user = await this.userModel
      .findOneAndUpdate(
        { email, status: AccountStatus.ACTIVE },
        {
          $set: {
            passwordResetTokenHash: hashToken(token),
            passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
          },
        },
        { returnDocument: 'after' },
      )
      .select('email firstName');

    if (user) {
      // Sent in the background so the reply takes the same time whether or not the email exists.
      void this.mail
        .send({
          to: user.email,
          subject: 'Reset your password',
          text:
            `Hi ${user.firstName},\n\n` +
            'We received a request to reset your password. This link is valid for 30 minutes and can be used once. ' +
            'If you did not ask for this, you can ignore this email; your password stays the same.',
          action: { label: 'Reset my password', url: `${this.mail.appUrl}/reset-password?token=${token}` },
        })
        .catch((err: Error) => this.logger.error(`Reset email could not be sent: ${err.message}`));
    }

    return FORGOT_PASSWORD_REPLY;
  }

  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const user = await this.userModel.findOneAndUpdate(
      {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: { $gt: new Date() },
        status: AccountStatus.ACTIVE,
      },
      {
        $set: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
        $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' },
      },
    );
    if (!user) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    // Anyone who was logged in with the old password is logged out.
    await this.sessionModel.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

    return { message: 'Password reset. You can now log in with your new password.' };
  }
}