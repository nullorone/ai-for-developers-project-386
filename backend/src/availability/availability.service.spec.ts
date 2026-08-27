import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  const calendar = { id: 'calendar-id' };
  const calendars = { findOnly: jest.fn().mockResolvedValue(calendar) };
  const windows = { createAtomic: jest.fn() };
  const service = new AvailabilityService(calendars as never, windows as never, {
    now: () => new Date('2026-09-01T10:00:00Z'),
  });

  it.each([
    [{ startsAt: '2026-09-02T10:00:00Z', endsAt: '2026-09-02T10:00:00Z' }, 'A-4'],
    [{ startsAt: '2026-08-31T10:00:00Z', endsAt: '2026-09-01T10:00:00Z' }, 'A-6'],
    [{ startsAt: '2026-09-02T10:00:00Z', endsAt: '2026-09-16T10:30:00Z' }, 'A-7'],
  ])('проверяет временные границы %#', async (input, rule) => {
    await expect(service.create(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ rule }],
    });
    expect(windows.createAtomic).not.toHaveBeenCalled();
  });

  it('маппит пересечение в стабильную конфликтную ошибку A-5', async () => {
    windows.createAtomic.mockResolvedValueOnce({
      kind: 'overlap',
      window: {
        id: 'w',
        startsAt: new Date('2026-09-02T09:00:00Z'),
        endsAt: new Date('2026-09-02T11:00:00Z'),
        createdAt: new Date(),
      },
    });
    await expect(
      service.create({ startsAt: '2026-09-02T10:00:00Z', endsAt: '2026-09-02T12:00:00Z' }),
    ).rejects.toMatchObject({
      code: 'AVAILABILITY_OVERLAP',
      status: 409,
      details: [{ rule: 'A-5' }],
    });
  });
});
