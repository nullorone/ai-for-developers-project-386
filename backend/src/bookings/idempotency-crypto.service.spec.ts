import { ConfigService } from '@nestjs/config';

import type { Env } from '../common/config/env.schema';
import type { BookingCreatedDto } from './booking.types';
import { IdempotencyCryptoService } from './idempotency-crypto.service';

describe('IdempotencyCryptoService', () => {
  const response: BookingCreatedDto = {
    id: '8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10',
    calendarId: '6f1c2f0e-9a1e-4d3b-9a4a-0f5b3f2a1c11',
    calendarSlug: 'demo',
    calendarTitle: 'Consultation',
    startsAt: '2026-09-02T09:00:00Z',
    endsAt: '2026-09-02T09:30:00Z',
    durationMinutes: 30,
    status: 'CONFIRMED',
    createdAt: '2026-09-01T08:00:00Z',
    managementToken: 'secret_management_token_1234567890',
    managementPath: '/bookings/8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10',
  };
  const config = new ConfigService<Env, true>({
    IDEMPOTENCY_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  } as Env);

  it('round-trips response and never stores the token as plaintext', () => {
    const crypto = new IdempotencyCryptoService(config);
    const first = crypto.encrypt(response);
    const second = crypto.encrypt(response);

    expect(first.ciphertext).not.toContain(response.managementToken);
    expect(second.ciphertext).not.toBe(first.ciphertext);
    expect(crypto.decrypt(first)).toEqual(response);
    expect(crypto.decrypt(second)).toEqual(response);
  });
});
