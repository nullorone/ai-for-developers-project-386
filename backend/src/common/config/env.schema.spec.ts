import { parseCorsOrigins, validateEnv } from './env.schema';

const validDatabaseUrl = 'postgresql://booking:booking@localhost:5432/booking_call';

describe('validateEnv', () => {
  it('подставляет значения по умолчанию и приводит PORT к числу', () => {
    const env = validateEnv({ DATABASE_URL: validDatabaseUrl, PORT: '8080' });

    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PREFIX).toBe('api/v1');
    expect(env.LOG_LEVEL).toBe('log');
  });

  it('падает без DATABASE_URL, а не стартует с неполной конфигурацией', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('отклоняет базу с чужой схемой подключения', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://user:pass@localhost:3306/db' })).toThrow(
      /postgres/,
    );
  });

  it('отклоняет нечисловой порт', () => {
    expect(() => validateEnv({ DATABASE_URL: validDatabaseUrl, PORT: 'not-a-port' })).toThrow(
      /PORT/,
    );
  });
});

describe('parseCorsOrigins', () => {
  it('разбирает список origin', () => {
    expect(parseCorsOrigins('http://a.test, http://b.test')).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });

  it('трактует * как «любой origin»', () => {
    expect(parseCorsOrigins(' * ')).toBe(true);
  });
});
