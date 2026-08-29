import { z } from 'zod';

/**
 * Валидация переменных окружения выполняется один раз при старте процесса.
 * Приложение обязано падать быстро и с понятным сообщением, а не стартовать
 * с наполовину заданной конфигурацией.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Порт HTTP-сервера. */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /** Глобальный префикс из контракта: сервер объявлен как http://localhost:3000/api/v1. */
  API_PREFIX: z
    .string()
    .regex(/^[a-z0-9/\-_]+$/i, 'API_PREFIX может содержать только буквы, цифры, дефис и слэш')
    .default('api/v1'),

  /**
   * Строка подключения PostgreSQL для Prisma.
   * Модели данных появятся на этапе 5; соединение на этапе каркаса ленивое,
   * поэтому приложение стартует и без поднятой базы.
   */
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'DATABASE_URL должен быть postgres:// или postgresql:// URL',
    }),

  /** 32-byte key used only for the short-lived encrypted idempotency response. */
  IDEMPOTENCY_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'IDEMPOTENCY_ENCRYPTION_KEY должен содержать 64 hex-символа'),

  /** Allowlist frontend origins; wildcard допустим только без credentialed CORS. */
  CORS_ORIGINS: z
    .string()
    .min(1)
    .default('http://localhost:5173,http://localhost:4173,https://nullorone.github.io'),

  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

  /** Messaging можно отключить для unit/API-тестов и окружений без постоянного worker. */
  MESSAGING_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  RABBITMQ_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('amqp://') || value.startsWith('amqps://'), {
      message: 'RABBITMQ_URL должен быть amqp:// или amqps:// URL',
    })
    .default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_EXCHANGE: z.string().min(1).max(128).default('booking.events.v1'),
  RABBITMQ_QUEUE: z.string().min(1).max(128).default('booking.notifications.v1'),
  RABBITMQ_RETRY_EXCHANGE: z.string().min(1).max(128).default('booking.retry.v1'),
  RABBITMQ_RETRY_QUEUE: z.string().min(1).max(128).default('booking.notifications.retry.v1'),
  RABBITMQ_DLQ_EXCHANGE: z.string().min(1).max(128).default('booking.dlx.v1'),
  RABBITMQ_DLQ: z.string().min(1).max(128).default('booking.notifications.dlq.v1'),
  RABBITMQ_PREFETCH: z.coerce.number().int().min(1).max(100).default(10),
  RABBITMQ_RETRY_LIMIT: z.coerce.number().int().min(0).max(20).default(3),
  RABBITMQ_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(3_600_000).default(5000),
  RABBITMQ_RECONNECT_MIN_MS: z.coerce.number().int().min(100).max(60_000).default(500),
  RABBITMQ_RECONNECT_MAX_MS: z.coerce.number().int().min(100).max(300_000).default(30_000),
  RABBITMQ_CONFIRM_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  OUTBOX_CLAIM_LEASE_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n  - ');

    throw new Error(`Некорректная конфигурация окружения backend:\n  - ${issues}`);
  }

  return parsed.data;
}

export function parseCorsOrigins(value: string): string[] | true {
  if (value.trim() === '*') {
    return true;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
