import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  DomainError,
  ErrorEnvelope,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from './errors';

interface RequestWithContext extends Request {
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();
    const traceId = request.requestId ?? (request.headers['x-request-id'] as string | undefined) ?? randomUUID();

    const domain = this.toDomainError(exception);
    const envelope: ErrorEnvelope = {
      error: {
        code: domain.code,
        message: domain.message,
        traceId,
        ...(domain.fields ? { fields: domain.fields } : {}),
      },
    };

    if (domain.httpStatus >= 500) {
      this.logger.error(
        { traceId, code: domain.code, status: domain.httpStatus, path: request.url, method: request.method },
        domain.stack ?? domain.message,
      );
    } else {
      this.logger.warn?.({ traceId, code: domain.code, status: domain.httpStatus, path: request.url }, domain.message);
    }

    response.status(domain.httpStatus).json(envelope);
  }

  private toDomainError(exception: unknown): DomainError {
    if (exception instanceof DomainError) {
      return exception;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      const message =
        typeof resp === 'string'
          ? resp
          : typeof resp === 'object' && resp !== null && 'message' in resp
            ? String((resp as { message: unknown }).message)
            : exception.message;

      if (status === 400) {
        const fields =
          typeof resp === 'object' && resp !== null && 'fields' in resp
            ? (resp as { fields?: Record<string, string> }).fields
            : undefined;
        return new ValidationError(message, fields);
      }
      if (status === 401) return new UnauthenticatedError(message);
      if (status === 403) return new ForbiddenError(message);
      if (status === 404) return new NotFoundError(message);
      if (status === 409) return new ConflictError(message);
      if (status === 429) return new RateLimitedError(message);
      return new InternalError(message || 'Unexpected error.');
    }
    if (exception instanceof Error) {
      return new InternalError(exception.message || 'Unexpected error.');
    }
    return new InternalError('Unexpected error.');
  }
}
