import type { LogLevel } from '@nestjs/common';

import type { Env } from './env.schema';

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/** Превращает минимальный уровень из окружения в список уровней NestJS. */
export function resolveLogLevels(minLevel: Env['LOG_LEVEL']): LogLevel[] {
  return LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(minLevel) + 1);
}
