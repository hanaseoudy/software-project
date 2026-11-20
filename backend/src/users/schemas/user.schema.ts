import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
}

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
}

export enum SupportedCurrency {
  EGP = 'EGP',
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  SAR = 'SAR',
  AED = 'AED',
  JPY = 'JPY',
}

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ type: String, trim: true })
  phoneNumber?: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Prop({
    type: String,
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

  @Prop({
    type: {
      currency: {
        type: String,
        enum: SupportedCurrency,
        default: SupportedCurrency.EGP,
      },
    },
    default: {},
  })
  preferences: {
    currency: SupportedCurrency;
  };

  /**
   * ACC-02: false from registration until the user opens the link in the verification email.
   * Accounts created before ACC-02 have no value and count as verified.
   */
  @Prop({ type: Boolean })
  emailVerified?: boolean;

  /** ACC-02: SHA-256 of the current verification token (the token itself is only in the email). */
  @Prop({ type: String, select: false })
  emailVerificationTokenHash?: string;

  @Prop({ type: Date, select: false })
  emailVerificationExpiresAt?: Date;

  /** ACC-07: SHA-256 of the current password reset token; a newer request replaces it. */
  @Prop({ type: String, select: false })
  passwordResetTokenHash?: string;

  @Prop({ type: Date, select: false })
  passwordResetExpiresAt?: Date;

  @Prop({ type: Number, default: 0, select: false })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null, select: false })
  lockedUntil: Date | null;

  @Prop({ type: Boolean, default: false })
  mustChangePassword: boolean;

  @Prop({ type: Date })
  termsAcceptedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);