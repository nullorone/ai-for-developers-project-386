/**
 * Типы и константы, продиктованные корневым `openapi.yaml`.
 *
 * Контракт — источник истины (ADR 0002); эти определения написаны вручную по нему
 * и не генерируются из декораторов NestJS. Контрактные тесты этапа 9 сверяют
 * фактические ответы со схемами контракта.
 */

/** `components.schemas.ErrorCode`. */
export const ERROR_CODES = [
  'MALFORMED_REQUEST',
  'BOOKING_TOKEN_INVALID',
  'CALENDAR_NOT_FOUND',
  'BOOKING_NOT_FOUND',
  'AVAILABILITY_WINDOW_NOT_FOUND',
  'SLOT_TAKEN',
  'AVAILABILITY_OVERLAP',
  'AVAILABILITY_WINDOW_HAS_BOOKINGS',
  'IDEMPOTENCY_KEY_REUSED',
  'BOOKING_ALREADY_STARTED',
  'BOOKING_NOT_RESCHEDULABLE',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** `components.schemas.ValidationDetail`. */
export interface ValidationDetail {
  location: 'body' | 'query' | 'path' | 'header';
  field: string;
  rule?: string;
  message: string;
}

/** `components.schemas.Error` (`application/problem+json`). */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: ValidationDetail[];
  retryAfterSeconds?: number;
  requestId: string;
  timestamp: string;
}

/** `components.schemas.HealthCheck`. */
export interface HealthCheck {
  name: 'database' | 'messageBroker';
  status: 'up' | 'down';
}

/** `components.schemas.HealthStatus`. */
export interface HealthStatus {
  status: 'up' | 'down';
  checks: HealthCheck[];
  timestamp: string;
}

export const REQUEST_ID_HEADER = 'X-Request-Id';
export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';

/**
 * `components.schemas.UtcTimestamp`: RFC 3339, UTC, точность до секунд,
 * без долей секунды (правило T-1).
 */
export function toUtcTimestamp(date: Date = new Date()): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}
