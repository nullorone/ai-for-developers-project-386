import { ContractException } from '../common/errors/contract.exception';
import { BookingsService } from './bookings.service';

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
});
