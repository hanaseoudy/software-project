// airlines.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from './schemas/airline.schema';
import {
  ModeratorAssignment,
  ModeratorAssignmentSchema,
} from '../users/schemas/moderatorassignment.schema'; // adjust to where your file is
import { AirlinesController } from './airlines.controller';
import { AirlinesService } from './airlines.service';
import { UploadsModule } from '../uploads/uploads.module';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: ModeratorAssignment.name, schema: ModeratorAssignmentSchema },
    ]),
    UploadsModule,
  ],
  controllers: [AirlinesController],
  providers: [JwtService, AirlinesService],
})
export class AirlinesModule {}
