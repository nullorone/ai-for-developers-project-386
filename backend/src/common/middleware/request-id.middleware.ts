import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { REQUEST_ID_HEADER } from '../contract';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Контракт требует `X-Request-Id` в каждом ответе, а поле `requestId` присутствует
 * в теле любой ошибки. Клиентский идентификатор принимается, только если это UUID:
 * посторонняя строка не должна попадать в логи и ответы.
 *
 * Подключается глобально в `main.ts` (`app.use`), поэтому не зависит от способа
 * сопоставления маршрутов в текущей версии Express.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && UUID_PATTERN.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}

export function getRequestId(req: Pick<Request, 'requestId'> | undefined): string {
  return req?.requestId ?? randomUUID();
}
