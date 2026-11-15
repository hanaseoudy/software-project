import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentsModule } from './payments/payments.module';
import { BlogModule } from './blog/blog.module';
import { HotelBookingsModule } from './hotel-bookings/hotel-bookings.module';
import { HotelsModule } from './hotels/hotels.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { AirportsModule } from './airports/airports.module';
import { UploadsModule } from './uploads/uploads.module';
import { ItinerariesModule } from './itineraries/itineraries.module';
import { warnIfDatabaseMissing } from './common/config/mongodb.config';
import { AirlinesModule } from './airlines/airlines.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { FlightsModule } from './flights/flights.module';
import { FlightBookingsModule } from './flight-bookings/flight-bookings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');

        if (!uri) {
          throw new Error('MongoDB URI is missing check env file');
        }
        warnIfDatabaseMissing(uri, (message) => console.warn(message));

        return {
          uri,
          autoCreate: true,
          connectionFactory: (connection) => {
            console.log('MongoDB connected successfully!');
            return connection;
          },
        };
      },
    }),
    AirportsModule,
    PaymentsModule,
    BlogModule,
    HotelBookingsModule,
    HotelsModule,
    UsersModule,
    NotificationsModule,
    AuthModule,
    UploadsModule,
    AirlinesModule,
    ItinerariesModule,
    AdminModule,
    ItinerariesModule,
    ReportsModule,
    FlightsModule,
    FlightBookingsModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
