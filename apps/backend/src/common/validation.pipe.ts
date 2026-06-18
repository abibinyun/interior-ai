import { BadRequestException, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { ValidationError } from 'class-validator';

/**
 * Build a NestJS ValidationPipe that surfaces class-validator errors as
 * the standardized error envelope documented in `docs/05-api-contract.md
 * §2.1` (400 VALIDATION_FAILED) with `error.fields` carrying a
 * `{ path: humanMessage }` map for every failed constraint.
 *
 * NestJS's built-in ValidationPipe throws `BadRequestException` whose
 * response is `{ statusCode, message: string[], error: 'Bad Request' }`.
 * We post-process that into `{ statusCode, message, error, fields }` so
 * the AllExceptionsFilter can map it cleanly into the contract envelope.
 */
export function buildValidationPipe(
  options: ValidationPipeOptions = {},
): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    ...options,
    exceptionFactory: (errors: ValidationError[]) => {
      const fields = flattenValidationErrors(errors);
      return new BadRequestException({
        message: 'Validation failed.',
        fields,
      });
    },
  });
}

/**
 * Flatten a class-validator `ValidationError[]` into a `{ path: message }`
 * map. Nested DTOs are joined with `.` (e.g. `address.city`).
 *
 * For each property we emit only the FIRST constraint to keep the error
 * map small and predictable — class-validator returns multiple
 * constraints per property otherwise.
 */
function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const err of errors) {
    const path = parentPath ? `${parentPath}.${err.property}` : err.property;
    if (err.constraints) {
      const firstMessage = Object.values(err.constraints)[0];
      if (firstMessage) {
        fields[path] = firstMessage;
      }
    }
    if (err.children && err.children.length > 0) {
      Object.assign(fields, flattenValidationErrors(err.children, path));
    }
  }
  return fields;
}
