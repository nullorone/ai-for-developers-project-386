import { SlotGeneratorService } from './slot-generator.service';

const date = (value: string): Date => new Date(value);

describe('SlotGeneratorService', () => {
  const generator = new SlotGeneratorService();

  it('генерирует полуинтервалы по 30 минут и соблюдает границы диапазона', () => {
    const slots = generator.generate({
      range: { startsAt: date('2026-09-01T09:30:00Z'), endsAt: date('2026-09-01T10:30:00Z') },
      availability: [
        { startsAt: date('2026-09-01T09:00:00Z'), endsAt: date('2026-09-01T11:00:00Z') },
      ],
      activeReservationStarts: [],
      earliestStart: date('2026-09-01T00:00:00Z'),
    });

    expect(slots).toEqual([
      { startsAt: date('2026-09-01T09:30:00Z'), endsAt: date('2026-09-01T10:00:00Z') },
      { startsAt: date('2026-09-01T10:00:00Z'), endsAt: date('2026-09-01T10:30:00Z') },
    ]);
  });

  it('исключает прошлое/lead time и активные reservations', () => {
    const slots = generator.generate({
      range: { startsAt: date('2026-09-01T09:00:00Z'), endsAt: date('2026-09-01T12:00:00Z') },
      availability: [
        { startsAt: date('2026-09-01T09:00:00Z'), endsAt: date('2026-09-01T12:00:00Z') },
      ],
      activeReservationStarts: [date('2026-09-01T11:00:00Z')],
      earliestStart: date('2026-09-01T10:45:00Z'),
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual(['2026-09-01T11:30:00.000Z']);
  });

  it('не создает неполный слот и убирает дубликаты', () => {
    const slots = generator.generate({
      range: { startsAt: date('2026-09-01T00:00:00Z'), endsAt: date('2026-09-02T00:00:00Z') },
      availability: [
        { startsAt: date('2026-09-01T09:00:00Z'), endsAt: date('2026-09-01T09:45:00Z') },
        { startsAt: date('2026-09-01T09:00:00Z'), endsAt: date('2026-09-01T09:30:00Z') },
      ],
      activeReservationStarts: [],
      earliestStart: date('2026-08-01T00:00:00Z'),
    });

    expect(slots).toEqual([
      { startsAt: date('2026-09-01T09:00:00Z'), endsAt: date('2026-09-01T09:30:00Z') },
    ]);
  });

  it('работает с абсолютным UTC независимо от DST и timezone процесса', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const slots = generator.generate({
        range: { startsAt: date('2026-03-29T00:00:00Z'), endsAt: date('2026-03-29T03:00:00Z') },
        availability: [
          { startsAt: date('2026-03-29T00:30:00Z'), endsAt: date('2026-03-29T02:00:00Z') },
        ],
        activeReservationStarts: [],
        earliestStart: date('2026-01-01T00:00:00Z'),
      });
      expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
        '2026-03-29T00:30:00.000Z',
        '2026-03-29T01:00:00.000Z',
        '2026-03-29T01:30:00.000Z',
      ]);
    } finally {
      process.env.TZ = original;
    }
  });
});
