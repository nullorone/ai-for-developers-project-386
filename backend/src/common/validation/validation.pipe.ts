import { HttpStatus, ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
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
  return new ContractValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]) => {
      const missingRequiredValue = containsConstraint(errors, 'isDefined');
      return new ContractException({
        code: missingRequiredValue ? 'MALFORMED_REQUEST' : 'VALIDATION_ERROR',
        status: missingRequiredValue ? HttpStatus.BAD_REQUEST : HttpStatus.UNPROCESSABLE_ENTITY,
        message: missingRequiredValue
          ? 'A required request value is missing.'
          : 'Request payload violates product rules.',
        details: flattenValidationErrors(errors).slice(0, 50),
      });
    },
  });
}

class ContractValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (!(error instanceof ContractException)) throw error;
      const location =
        metadata.type === 'param' ? 'path' : metadata.type === 'query' ? 'query' : 'body';
      throw new ContractException({
        code: error.code,
        status: error.getStatus(),
        message: error.message,
        details: error.details?.map((detail) => ({ ...detail, location })),
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
  }
}

function containsConstraint(errors: ValidationError[], name: string): boolean {
  return errors.some(
    (error) => Boolean(error.constraints?.[name]) || containsConstraint(error.children ?? [], name),
  );
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
