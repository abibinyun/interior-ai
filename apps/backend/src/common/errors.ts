/**
 * Domain error envelope.
 *
 * Every error thrown from the application layer should extend `DomainError`
 * so the AllExceptionsFilter can map it to a stable HTTP response shape.
 *
 * Error envelope (matches docs/05-api-contract.md §2):
 *   {
 *     "error": {
 *       "code":    "STABLE_CODE",
 *       "message": "Human-friendly message",
 *       "traceId": "req_..."
 *     }
 *   }
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'PROMPT_INVALID'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_BROKEN'
  | 'STORAGE_FAILED'
  | 'UPLOAD_REJECTED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    traceId?: string;
    fields?: Record<string, string>;
  };
}

export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message: string, httpStatus: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.fields = fields;
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Validation failed.', fields?: Record<string, string>) {
    super('VALIDATION_FAILED', message, 400, fields);
    this.name = 'ValidationError';
  }
}

export class PromptInvalidError extends DomainError {
  constructor(message = 'Brief content failed semantic validation.', fields?: Record<string, string>) {
    super('PROMPT_INVALID', message, 400, fields);
    this.name = 'PromptInvalidError';
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = 'Missing or invalid session.') {
    super('UNAUTHENTICATED', message, 401);
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You do not have access to this resource.') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'Operation conflicts with current state.') {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

export class BusinessRuleViolationError extends DomainError {
  constructor(message = 'Operation violates a business rule.') {
    super('BUSINESS_RULE_VIOLATION', message, 422);
    this.name = 'BusinessRuleViolationError';
  }
}

export class ProviderTimeoutError extends DomainError {
  constructor(message = 'The image provider did not respond in time.') {
    super('PROVIDER_TIMEOUT', message, 502);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderRejectedError extends DomainError {
  constructor(message = 'The image provider refused the request.') {
    super('PROVIDER_REJECTED', message, 502);
    this.name = 'ProviderRejectedError';
  }
}

export class ProviderBrokenError extends DomainError {
  constructor(message = 'The image provider returned a malformed response.') {
    super('PROVIDER_BROKEN', message, 502);
    this.name = 'ProviderBrokenError';
  }
}

export class StorageError extends DomainError {
  constructor(message = 'Storage operation failed.') {
    super('STORAGE_FAILED', message, 502);
    this.name = 'StorageError';
  }
}

export class UploadRejectedError extends DomainError {
  constructor(message = 'Uploaded file failed validation.', fields?: Record<string, string>) {
    super('UPLOAD_REJECTED', message, 400, fields);
    this.name = 'UploadRejectedError';
  }
}

export class RateLimitedError extends DomainError {
  constructor(message = 'Too many requests. Please try again later.') {
    super('RATE_LIMITED', message, 429);
    this.name = 'RateLimitedError';
  }
}

export class InternalError extends DomainError {
  constructor(message = 'An unexpected error occurred.') {
    super('INTERNAL', message, 500);
    this.name = 'InternalError';
  }
}
