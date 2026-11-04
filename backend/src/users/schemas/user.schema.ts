
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
