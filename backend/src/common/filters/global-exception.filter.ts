import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { STATUS_CODES } from 'node:http';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter<unknown> {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    // Exclude query parameters, which may contain private information.
    const path = request.originalUrl.split('?')[0];

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      details = typeof body === 'string' ? { message: body } : { ...body };
      if (exception.errorCode !== undefined) {
        details.errorCode ??= exception.errorCode;
      }
    } else if (this.isHttpError(exception)) {
      // Keep Nest's handling of middleware errors (e.g. malformed JSON).
      status = exception.statusCode;
      details.message = this.getHttpErrorMessage(exception);
    } else {
      details.message = 'Internal server error';
      // Do not log raw exceptions, request bodies or headers: they may contain secrets.
      this.logger.error(`Unexpected error handling ${request.method} ${path}`);
    }

    const statusLabel = STATUS_CODES[status] ?? 'Error';
    const message = details.message;
    const hasValidMessage =
      typeof message === 'string' ||
      (Array.isArray(message) &&
        message.every((item) => typeof item === 'string'));

    const body = {
      ...details,
      statusCode: status,
      message: hasValidMessage ? message : statusLabel,
      error: typeof details.error === 'string' ? details.error : statusLabel,
      timestamp: new Date().toISOString(),
      path,
    };

    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }

    httpAdapter.reply(response, body, status);
  }
}
