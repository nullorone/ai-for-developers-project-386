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

  /** Список разрешенных origin через запятую или `*` для локальной разработки. */
  CORS_ORIGINS: z.string().min(1).default('http://localhost:5173,http://localhost:4173'),

  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
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
