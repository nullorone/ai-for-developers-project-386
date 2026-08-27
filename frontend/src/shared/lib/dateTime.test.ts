import { describe, expect, it } from 'vitest';

import { formatInTimeZone, localInputToUtc } from './dateTime';

describe('UTC и локальное отображение', () => {
  it('показывает один UTC-момент по-разному в двух часовых поясах', () => {
    const instant = '2026-09-01T09:00:00Z';

    expect(formatInTimeZone(instant, 'Europe/Moscow')).toContain('12:00');
    expect(formatInTimeZone(instant, 'America/New_York')).toContain('05:00');
  });

  it('отправляет datetime-local как UTC со служебным Z', () => {
    expect(localInputToUtc('2026-09-01T09:00')).toMatch(/^2026-09-01T\d{2}:00:00Z$/);
  });
});
