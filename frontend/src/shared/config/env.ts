import { z } from 'zod';

/**
 * Значение по умолчанию — локальный Prism mock из корневого контракта.
 * Prism обслуживает операции от корня, без префикса `/api/v1`; боевой backend
 * добавляет префикс. Поэтому адрес всегда приходит из переменной окружения
 * (см. docs/api.md, раздел 3).
 */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4010';

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default(DEFAULT_API_BASE_URL),
});

export type AppConfig = {
  readonly apiBaseUrl: string;
};

export function readAppConfig(source: Record<string, unknown>): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Некорректные переменные окружения frontend: ${issues}`);
  }

  return { apiBaseUrl: parsed.data.VITE_API_BASE_URL.replace(/\/+$/, '') };
}

export const appConfig = readAppConfig(import.meta.env as unknown as Record<string, unknown>);
