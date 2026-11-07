import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
// import { AppModule, ObserveInstrument } from './app.module';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: 'Validation failed',
          errors: Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})])),
        }),
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();