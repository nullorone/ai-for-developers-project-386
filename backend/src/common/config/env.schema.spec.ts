import { parseCorsOrigins, validateEnv } from './env.schema';

const validDatabaseUrl = 'postgresql://booking:booking@localhost:5432/booking_call';
const validEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const validEnv = {
  DATABASE_URL: validDatabaseUrl,
  IDEMPOTENCY_ENCRYPTION_KEY: validEncryptionKey,
};

describe('validateEnv', () => {
  it('подставляет значения по умолчанию и приводит PORT к числу', () => {
    const env = validateEnv({ ...validEnv, PORT: '8080' });

    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PREFIX).toBe('api/v1');
    expect(env.CORS_ORIGINS).toContain('https://nullorone.github.io');
    expect(env.LOG_LEVEL).toBe('log');
    expect(env.MESSAGING_ENABLED).toBe(true);
    expect(env.RABBITMQ_URL).toBe('amqp://guest:guest@localhost:5672');
  });

  it('падает без DATABASE_URL, а не стартует с неполной конфигурацией', () => {
    expect(() => validateEnv({ IDEMPOTENCY_ENCRYPTION_KEY: validEncryptionKey })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('отклоняет базу с чужой схемой подключения', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
        IDEMPOTENCY_ENCRYPTION_KEY: validEncryptionKey,
      }),
    ).toThrow(/postgres/);
  });

  it('отклоняет нечисловой порт', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('валидирует RabbitMQ URL и преобразует feature flag', () => {
    expect(validateEnv({ ...validEnv, MESSAGING_ENABLED: 'false' }).MESSAGING_ENABLED).toBe(false);
    expect(() => validateEnv({ ...validEnv, RABBITMQ_URL: 'https://broker.test' })).toThrow(
      /RABBITMQ_URL/,
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
