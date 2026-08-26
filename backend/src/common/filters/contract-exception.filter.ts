import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  PROBLEM_JSON_CONTENT_TYPE,
  toUtcTimestamp,
  type ErrorBody,
  type ErrorCode,
} from '../contract';
import { ContractException } from '../errors/contract.exception';
import { getRequestId } from '../middleware/request-id.middleware';

/**
 * Соответствие HTTP-статуса машинному коду по умолчанию (docs/api.md, раздел «Ошибки»).
 * Доменный код задает код явно через ContractException; таблица нужна для исключений
 * самого фреймворка.
 *
 * 404 в таблице отсутствует намеренно: у контракта нет универсального «не найдено»,
 * а обращение к несуществующему маршруту вообще лежит вне контракта. Такой запрос
 * трактуется как неразбираемый — `MALFORMED_REQUEST`.
 */
const SERVER_ERROR_THRESHOLD = 500;

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'MALFORMED_REQUEST',
  [HttpStatus.FORBIDDEN]: 'BOOKING_TOKEN_INVALID',
  [HttpStatus.CONFLICT]: 'SLOT_TAKEN',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

@Catch()
export class ContractExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ContractExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const isServerError = status >= SERVER_ERROR_THRESHOLD;

    const body: ErrorBody = {
      code: this.resolveCode(exception, status),
      // Наружу уходит только безопасный текст: внутренние сообщения 5xx
      // не раскрываются (правило N-10).
      message: isServerError ? 'Internal server error.' : this.resolveMessage(exception, status),
      requestId: getRequestId(request),
      timestamp: toUtcTimestamp(),
    };

    if (exception instanceof ContractException) {
      if (exception.details?.length) {
        body.details = exception.details;
      }
      if (exception.retryAfterSeconds !== undefined) {
        body.retryAfterSeconds = exception.retryAfterSeconds;
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
    }

    if (isServerError) {
      this.logger.error(
        { requestId: body.requestId, method: request.method, path: request.path },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).type(PROBLEM_JSON_CONTENT_TYPE).json(body);
  }

  private resolveCode(exception: unknown, status: number): ErrorCode {
    if (exception instanceof ContractException) {
      return exception.code;
    }

    if (status >= SERVER_ERROR_THRESHOLD) {
      return 'INTERNAL_ERROR';
    }

    return STATUS_TO_CODE[status] ?? 'MALFORMED_REQUEST';
  }

  private resolveMessage(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return payload;
      }

      if (typeof payload === 'object' && payload !== null && 'message' in payload) {
        const { message } = payload;

        if (typeof message === 'string') {
          return message;
        }
        if (Array.isArray(message) && typeof message[0] === 'string') {
          return message[0];
        }
      }
    }

    return `Request failed with status ${status}.`;
  }
}
