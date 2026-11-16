import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ModeratorAssignment,
  ModeratorAssignmentSchema,
} from '../../users/schemas/moderatorassignment.schema';
import { Flight, FlightSchema } from '../../flights/schemas/flight.schema';
import { AccessControlService } from './access-control.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
      { name: Flight.name, schema: FlightSchema },
    ]),
  ],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}