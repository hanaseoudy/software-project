import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import {ModeratorAssignment, ModeratorAssignmentSchema,} from './schemas/moderatorassignment.schema';
import { AuthModule } from '../auth/auth.module';

@Module({ 
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
       {
        name: ModeratorAssignment.name,
        schema: ModeratorAssignmentSchema,
      },
    ]),
    AuthModule,
  ],
  providers: [UsersService],
  controllers: [UsersController]
})
export class UsersModule {}