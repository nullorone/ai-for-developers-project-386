import type { ValidationError } from 'class-validator';

import { SlotRangeDto } from '../../slots/slot-range.dto';
import { ContractException } from '../errors/contract.exception';
import { createValidationPipe, flattenValidationErrors } from './validation.pipe';

describe('flattenValidationErrors', () => {
  it('превращает ошибки class-validator в ValidationDetail контракта', () => {
    const errors: ValidationError[] = [
      {
        property: 'guestEmail',
        constraints: { isEmail: 'guestEmail must be an email' },
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { location: 'body', field: 'guestEmail', message: 'guestEmail must be an email' },
    ]);
  });

  it('разворачивает вложенные поля в точечную нотацию', () => {
    const errors: ValidationError[] = [
      {
        property: 'guest',
        children: [
          {
            property: 'name',
            constraints: { isNotEmpty: 'name should not be empty' },
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { location: 'body', field: 'guest.name', message: 'name should not be empty' },
    ]);
  });
});

describe('createValidationPipe', () => {
  const metadata = { type: 'query' as const, metatype: SlotRangeDto };

  it('возвращает 400 для отсутствующего обязательного query parameter', async () => {
    await expect(createValidationPipe().transform({}, metadata)).rejects.toMatchObject({
      code: 'MALFORMED_REQUEST',
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ location: 'query' })]) as unknown,
    });
  });

  it('возвращает 422 и location=query для недопустимого UTC значения', async () => {
    try {
      await createValidationPipe().transform(
        { from: '2026-09-01T00:00:00+03:00', to: '2026-09-02T00:00:00Z' },
        metadata,
      );
      throw new Error('Expected ContractException');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractException);
      expect(error).toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 422,
        details: [expect.objectContaining({ location: 'query', field: 'from' })],
      });
    }
  });
});
