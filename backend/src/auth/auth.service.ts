import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

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

  private emailTaken() {
    return new ConflictException({
      message: 'Validation failed',
      errors: { email: ['Email is already registered'] },
    });
  }
}