import { HttpException, type HttpStatus } from '@nestjs/common';

import type { ErrorCode, ValidationDetail } from '../contract';

export interface ContractExceptionOptions {
  code: ErrorCode;
  status: HttpStatus | number;
  message: string;
  details?: ValidationDetail[];
  retryAfterSeconds?: number;
}

/**
 * Единственный способ вернуть ошибку контракта из доменного кода.
 * Пара «HTTP-статус + машинный код» задается явно, а не выводится из типа
 * исключения NestJS: соответствие зафиксировано в ADR 0002 и docs/api.md.
 */
export class ContractException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: ValidationDetail[];
  readonly retryAfterSeconds?: number;

  constructor(options: ContractExceptionOptions) {
    super(options.message, options.status);

    this.code = options.code;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
