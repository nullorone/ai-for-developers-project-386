import { toUtcTimestamp } from './contract';

const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe('toUtcTimestamp', () => {
  it('форматирует время по схеме UtcTimestamp контракта', () => {
    expect(toUtcTimestamp(new Date('2026-09-01T09:00:00.123Z'))).toBe('2026-09-01T09:00:00Z');
  });

  it('всегда отдает 20 символов без долей секунды (правило T-1)', () => {
    const value = toUtcTimestamp();

    expect(value).toHaveLength(20);
    expect(value).toMatch(UTC_TIMESTAMP_PATTERN);
  });
});
