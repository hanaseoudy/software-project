import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HotelBookingsModule } from './hotel-bookings/hotel-bookings.module';


@Module({
  imports: [
    ConfigModule.forRoot( {
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject:[ConfigService],

      useFactory:(configService:ConfigService)=>{
        const uri=configService.get<string>('MONGODB_URI');

        if(!uri){
          throw new Error(
            'MongoDB URI is missing check env file',);
           }

        console.log('uri loaded...');

        return {
         uri,
         connectionFactory: (connection) => {
            console.log('MongoDB connected successfully!');
           return connection;
             },
           };
         },
        }),
    HotelBookingsModule,
      ],
  
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}