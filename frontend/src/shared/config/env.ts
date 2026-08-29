import { z } from 'zod';

/**
 * Development по умолчанию работает с реальным локальным backend. Prism остается
 * явным изолированным режимом: для него VITE_API_BASE_URL задают адрес без `/api/v1`.
 */
export const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';

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
