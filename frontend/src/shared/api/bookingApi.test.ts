import { describe, expect, it } from 'vitest';

import { ApiError, apiErrorMessage } from './bookingApi';
import type { components } from './generated/schema';

type ErrorCode = components['schemas']['ErrorCode'];

describe('apiErrorMessage', () => {
  it.each<[ErrorCode, RegExp]>([
    ['MALFORMED_REQUEST', /данные/i],
    ['VALIDATION_ERROR', /данные/i],
    ['BOOKING_TOKEN_INVALID', /ссылка/i],
    ['CALENDAR_NOT_FOUND', /календарь/i],
    ['BOOKING_NOT_FOUND', /бронирование/i],
    ['AVAILABILITY_WINDOW_NOT_FOUND', /интервал/i],
    ['SLOT_TAKEN', /занято/i],
    ['IDEMPOTENCY_KEY_REUSED', /попытка/i],
    ['AVAILABILITY_OVERLAP', /пересекается/i],
    ['AVAILABILITY_WINDOW_HAS_BOOKINGS', /встречу/i],
    ['BOOKING_ALREADY_STARTED', /началась/i],
    ['BOOKING_NOT_RESCHEDULABLE', /перенести/i],
    ['RATE_LIMITED', /много запросов/i],
    ['INTERNAL_ERROR', /недоступен/i],
  ])('локализует OpenAPI code %s', (code, expected) => {
    expect(apiErrorMessage(new ApiError(400, code, 'raw backend message'), 'fallback')).toMatch(
      expected,
    );
  });

  it('не показывает техническую сетевую ошибку пользователю', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'), 'Безопасное сообщение')).toBe(
      'Безопасное сообщение',
    );
  });
});
