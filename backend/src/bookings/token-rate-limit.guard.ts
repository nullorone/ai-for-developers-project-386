import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ContractException } from '../common/errors/contract.exception';

const WINDOW_MS = 60_000;
const LIMIT = 30;
const UUID_IN_PATH = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const CALENDAR_SLUG_IN_PATH = /\/calendars\/[^/]+\/bookings$/;

interface Bucket {
  count: number;
  resetsAt: number;
}

/** Small single-process MVP limiter; no request headers, body or secrets are retained. */
@Injectable()
export class TokenRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    const safeRoute = request.path
      .replace(UUID_IN_PATH, ':bookingId')
      .replace(CALENDAR_SLUG_IN_PATH, '/calendars/:slug/bookings');
    const key = `${request.ip}:${safeRoute}:${request.method}`;
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetsAt <= now) {
      bucket = { count: 0, resetsAt: now + WINDOW_MS };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, LIMIT - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetsAt - now) / 1000));
    response.setHeader('RateLimit-Limit', String(LIMIT));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetsAt / 1000)));
    if (bucket.count > LIMIT) {
      throw new ContractException({
        code: 'RATE_LIMITED',
        status: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Retry later.',
        retryAfterSeconds,
      });
    }
    return true;
  }
}
