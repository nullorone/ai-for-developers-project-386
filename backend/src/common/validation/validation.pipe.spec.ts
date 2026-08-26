import type { ValidationError } from 'class-validator';

import { flattenValidationErrors } from './validation.pipe';

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
