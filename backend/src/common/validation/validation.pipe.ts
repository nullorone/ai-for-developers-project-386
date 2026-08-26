import { HttpStatus, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import type { ValidationDetail } from '../contract';
import { ContractException } from '../errors/contract.exception';

/**
 * Контракт разделяет `400 MALFORMED_REQUEST` (запрос нельзя разобрать) и
 * `422 VALIDATION_ERROR` (запрос разобран, но нарушает продуктовые правила),
 * поэтому статус по умолчанию у ValidationPipe переопределяется на 422
 * (ADR 0002, docs/api.md).
 *
 * `forbidNonWhitelisted` отражает `additionalProperties: false` во всех схемах:
 * неизвестное поле — ошибка, а не молча отброшенные данные.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]) =>
      new ContractException({
        code: 'VALIDATION_ERROR',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Request payload violates product rules.',
        details: flattenValidationErrors(errors).slice(0, 50),
      }),
  });
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationDetail[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    const own: ValidationDetail[] = Object.values(error.constraints ?? {}).map((message) => ({
      location: 'body' as const,
      field: path || '$',
      message,
    }));

    const nested = error.children?.length ? flattenValidationErrors(error.children, path) : [];

    return [...own, ...nested];
  });
}
