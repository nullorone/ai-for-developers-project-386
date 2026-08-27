import { ContractException } from '../common/errors/contract.exception';
import { SlotsService } from './slots.service';

describe('SlotsService range validation', () => {
  const service = new SlotsService(
    { findBySlug: jest.fn() } as never,
    { queryInputs: jest.fn() } as never,
    { generate: jest.fn() },
    { now: () => new Date('2026-09-01T10:15:00Z') },
  );
  const now = new Date('2026-09-01T10:15:00Z');

  it('принимает точные допустимые границы 31 день, now-1 день и now+90 дней', () => {
    expect(service.validateRange('2026-08-31T10:15:00Z', '2026-10-01T10:15:00Z', now)).toEqual({
      startsAt: new Date('2026-08-31T10:15:00Z'),
      endsAt: new Date('2026-10-01T10:15:00Z'),
    });
    expect(() =>
      service.validateRange('2026-11-30T10:14:59Z', '2026-11-30T10:15:00Z', now),
    ).not.toThrow();
  });

  it.each([
    ['2026-09-02T00:00:00Z', '2026-09-01T00:00:00Z', 'to'],
    ['2026-09-01T00:00:00Z', '2026-10-02T00:00:01Z', 'to'],
    ['2026-08-31T10:14:59Z', '2026-09-01T00:00:00Z', 'from'],
    ['2026-11-30T10:14:59Z', '2026-11-30T10:15:01Z', 'to'],
  ])('отклоняет нарушение диапазона %s..%s', (from, to, field) => {
    try {
      service.validateRange(from, to, now);
      throw new Error('Expected validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractException);
      expect((error as ContractException).details?.[0]).toMatchObject({
        location: 'query',
        field,
        rule: 'S-5',
      });
    }
  });
});
