import { createParamDecorator, ExecutionContext, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { validationExceptionFactory } from '../common/validation/validation-exception.factory';

const RawQuery = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  context.switchToHttp().getRequest<Request>().query,
);

// Query string that rejects unknown parameters (for example "limit") with a 400 in the GEN-02 field-level
// format instead of silently stripping them. The global ValidationPipe skips custom decorators, so this
// pipe sees the raw query (same approach as StrictBody in the blog module).
export const StrictQuery = () =>
  RawQuery(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validateCustomDecorators: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
