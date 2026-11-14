import { Module } from '@nestjs/common';
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
import { AirlinesModule } from './airlines/airlines.module';
import { FlightsModule } from './flights/flights.module';
import { AdminModule } from './admin/admin.module';
import { warnIfDatabaseMissing } from './common/config/mongodb.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
    FlightsModule,
    AdminModule,
    ItinerariesModule,
  ],

  controllers: [AppController],
  providers: [
    AppService, // new line
  ],
})
export class AppModule {}
