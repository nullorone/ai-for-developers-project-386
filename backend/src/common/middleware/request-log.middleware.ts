import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { getRequestId } from './request-id.middleware';

const logger = new Logger('HttpAccess');

/** Logs only operational metadata: never headers, query strings, or request/response bodies. */
export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.log({
      event: 'http_request_completed',
      requestId: getRequestId(req),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
    });
  });
  next();
}
