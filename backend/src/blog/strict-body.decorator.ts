import { createParamDecorator, ExecutionContext, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { validationExceptionFactory } from '../common/validation/validation-exception.factory';

const RawBody = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  context.switchToHttp().getRequest<Request>().body,
);

// Request body that rejects unknown fields with a 400 (same field-level format as GEN-02) instead of
// silently stripping them. The global ValidationPipe skips custom decorators, so this pipe sees the raw body.
export const StrictBody = () =>
  RawBody(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validateCustomDecorators: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
