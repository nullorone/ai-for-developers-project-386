import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';

import { parseCorsOrigins, type Env } from './common/config/env.schema';
import { ContractExceptionFilter } from './common/filters/contract-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { createValidationPipe } from './common/validation/validation.pipe';

/**
 * Единая настройка приложения для боевого запуска и для e2e-тестов:
 * тесты обязаны проверять ровно ту конфигурацию, которая уходит в production.
 */
export function configureApp(app: INestApplication, env: Env): INestApplication {
  // Лишняя информация о стеке наружу не уходит (правило N-10).
  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');

  // Контракт объявляет сервер как http://localhost:3000/api/v1.
  app.setGlobalPrefix(env.API_PREFIX);
  app.use(requestIdMiddleware);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ContractExceptionFilter());
  app.enableCors({
    origin: parseCorsOrigins(env.CORS_ORIGINS),
    credentials: false,
    exposedHeaders: ['X-Request-Id', 'Idempotency-Replayed', 'Retry-After'],
    maxAge: 600,
  });
  app.enableShutdownHooks();

  return app;
}
