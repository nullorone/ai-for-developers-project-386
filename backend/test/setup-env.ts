/**
 * Тестовое окружение задается до импорта модулей приложения: `ConfigModule.forRoot`
 * валидирует переменные в момент загрузки `AppModule`.
 *
 * Значения фиктивные и не являются секретом. PostgreSQL на этапе 3 не поднимается:
 * Prisma подменяется заглушкой в e2e-тесте.
 */
export const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  API_PREFIX: 'api/v1',
  DATABASE_URL: 'postgresql://booking:booking@localhost:5432/booking_call_test',
  IDEMPOTENCY_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  CORS_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'error',
  MESSAGING_ENABLED: 'false',
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
} as const;

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] ??= value;
}
