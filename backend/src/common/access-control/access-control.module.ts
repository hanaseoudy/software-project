import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ModeratorAssignment,
  ModeratorAssignmentSchema,
} from '../../users/schemas/moderatorassignment.schema';
import { AccessControlService } from './access-control.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
    ]),
  ],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}