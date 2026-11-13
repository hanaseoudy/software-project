import { DocumentBuilder } from '@nestjs/swagger';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../auth/auth.cookies';

export const createSwaggerConfig = () => new DocumentBuilder()
  .setTitle('Travel Booking API')
  .setVersion('1.0')
  // Retain the default scheme used by existing blog decorators.
  .addCookieAuth(ACCESS_COOKIE)
  .addCookieAuth(ACCESS_COOKIE, { type: 'apiKey' }, ACCESS_COOKIE)
  .addCookieAuth(REFRESH_COOKIE, { type: 'apiKey' }, REFRESH_COOKIE)
  .build();
