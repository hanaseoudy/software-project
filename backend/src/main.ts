import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// import { AppModule, ObserveInstrument } from './app.module';
import { AppModule}from './app.module';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Travel Booking API')
    .setDescription('Travel planning and booking platform API')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    () => SwaggerModule.createDocument(app, swaggerConfig),
    { useGlobalPrefix: true },
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
