import { ContractException } from '../common/errors/contract.exception';
import { BookingsService } from './bookings.service';

const token = 'valid_management_token_1234567890';

describe('BookingsService', () => {
  const calendar = {
    id: 'calendar-id',
    slug: 'demo',
    title: 'Consultation',
    description: null,
    ownerTimeZone: 'UTC',
    slotDurationMinutes: 30,
    minimumLeadTimeMinutes: 60,
    bookingHorizonDays: 90,
  };
  const calendars = { findBySlug: jest.fn().mockResolvedValue(calendar) };
  const repository = {
    createAtomic: jest.fn(),
    findCancellation: jest.fn(),
    cancelAtomic: jest.fn(),
  };
  const service = new BookingsService(calendars as never, repository as never, {
    now: () => new Date('2026-09-01T08:00:00Z'),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    calendars.findBySlug.mockResolvedValue(calendar);
  });

  it('maps a database slot race to the stable SLOT_TAKEN conflict', async () => {
    repository.createAtomic.mockResolvedValue({ kind: 'slotTaken' });
    await expect(
      service.create('demo', {
        startsAt: '2026-09-02T09:00:00Z',
        guestName: 'Guest',
        guestEmail: 'guest@example.com',
      }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN', status: 409 });
  });

  it('rejects a malformed idempotency key without passing it to persistence', async () => {
    await expect(
      service.create(
        'demo',
        {
          startsAt: '2026-09-02T09:00:00Z',
          guestName: 'Guest',
          guestEmail: 'guest@example.com',
        },
        'too-short',
      ),
    ).rejects.toBeInstanceOf(ContractException);
    expect(repository.createAtomic).not.toHaveBeenCalled();
  });

  it('does not reveal booking data for a wrong token', async () => {
    repository.findCancellation.mockResolvedValue({
      managementTokenHash: 'a'.repeat(64),
    });
    await expect(
      service.getCancellation(
        '8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10',
        'wrong_management_token_12345',
      ),
    ).rejects.toMatchObject({ code: 'BOOKING_TOKEN_INVALID', status: 403 });
  });

  it('hashes generated tokens before persistence and returns only the created token', async () => {
    let persisted: { managementToken: string; managementTokenHash: string } | undefined;
    repository.createAtomic.mockImplementationOnce(
      (input: { managementToken: string; managementTokenHash: string }) => {
        persisted = input;
        return Promise.resolve({
          kind: 'created',
          response: { id: 'booking-id', managementToken: input.managementToken },
        });
      },
    );

    const result = await service.create('demo', {
      startsAt: '2026-09-02T09:00:00Z',
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
    });
    expect(persisted).toBeDefined();
    if (!persisted) throw new Error('Persistence input was not captured.');
    expect(persisted.managementToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(persisted.managementTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.managementTokenHash).not.toContain(persisted.managementToken);
    expect(result.booking.managementToken).toBe(persisted.managementToken);
  });

  it('validates a correct token hash and maps the minimal cancellation view', async () => {
    const { createHash } = await import('node:crypto');
    repository.findCancellation.mockResolvedValueOnce({
      id: 'booking-id',
      startsAt: new Date('2026-09-02T09:00:00Z'),
      endsAt: new Date('2026-09-02T09:30:00Z'),
      status: 'CONFIRMED',
      managementTokenHash: createHash('sha256').update(token).digest('hex'),
      cancelledAt: null,
      rescheduledAt: null,
      calendar: { title: 'Consultation' },
    });

    await expect(service.getCancellation('booking-id', token)).resolves.toEqual({
      id: 'booking-id',
      calendarTitle: 'Consultation',
      startsAt: '2026-09-02T09:00:00Z',
      endsAt: '2026-09-02T09:30:00Z',
      durationMinutes: 30,
      status: 'CONFIRMED',
      cancelledAt: null,
      rescheduledAt: null,
      cancellable: true,
    });
  });

  it.each([
    [{ kind: 'idempotencyReused' }, 'IDEMPOTENCY_KEY_REUSED', 409],
    [{ kind: 'outsideAvailability' }, 'VALIDATION_ERROR', 422],
    [{ kind: 'invalidTime', reason: 'leadTime' }, 'VALIDATION_ERROR', 422],
    [{ kind: 'invalidTime', reason: 'horizon' }, 'VALIDATION_ERROR', 422],
  ])('maps repository result %# to a stable API error', async (repositoryResult, code, status) => {
    repository.createAtomic.mockResolvedValueOnce(repositoryResult);
    await expect(
      service.create('demo', {
        startsAt: '2026-09-02T09:00:00Z',
        guestName: 'Guest',
        guestEmail: 'guest@example.com',
      }),
    ).rejects.toMatchObject({ code, status });
  });
});
