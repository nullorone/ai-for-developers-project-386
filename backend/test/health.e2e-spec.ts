import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { validateEnv } from '../src/common/config/env.schema';
import { PrismaService } from '../src/prisma/prisma.service';
import { TEST_ENV } from './setup-env';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Smoke-проверка каркаса без PostgreSQL: Prisma подменяется заглушкой,
 * потому что этап 3 не поднимает базу. Интеграция с реальной базой приходит
 * на этапе 5 (Testcontainers).
 */
async function createApp(databaseUp: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ isReachable: () => Promise.resolve(databaseUp) })
    .compile();

  const app = configureApp(moduleRef.createNestApplication(), validateEnv(TEST_ENV));
  await app.init();

  return app;
}

/** `getHttpServer()` типизирован как `any`; сужаем один раз в одном месте. */
function httpServer(app: INestApplication): App {
  return app.getHttpServer() as App;
}

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health отдает HealthStatus по контракту', async () => {
    const response = await request(httpServer(app)).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({
      status: 'up',
      checks: [{ name: 'database', status: 'up' }],
      timestamp: expect.stringMatching(UTC_TIMESTAMP_PATTERN) as string,
    });
  });

  it('GET /api/v1/health/live не зависит от зависимостей', async () => {
    const response = await request(httpServer(app)).get('/api/v1/health/live').expect(200);

    expect(response.body).toMatchObject({ status: 'up', checks: [] });
  });

  it('GET /api/v1/health/ready отдает 503 и HealthStatus, когда база недоступна', async () => {
    const degraded = await createApp(false);

    try {
      const response = await request(httpServer(degraded)).get('/api/v1/health/ready').expect(503);

      expect(response.body).toMatchObject({
        status: 'down',
        checks: [{ name: 'database', status: 'down' }],
      });
    } finally {
      await degraded.close();
    }
  });

  it('каждый ответ содержит X-Request-Id (UUID)', async () => {
    const response = await request(httpServer(app)).get('/api/v1/health/live').expect(200);

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('переиспользует корректный X-Request-Id клиента', async () => {
    const requestId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const response = await request(httpServer(app))
      .get('/api/v1/health/live')
      .set('X-Request-Id', requestId)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(requestId);
  });

  it('вне префикса контракта health недоступен', async () => {
    await request(httpServer(app)).get('/health').expect(404);
  });

  it('неизвестный маршрут отвечает телом ошибки контракта', async () => {
    const response = await request(httpServer(app)).get('/api/v1/unknown').expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      code: 'MALFORMED_REQUEST',
      requestId: expect.stringMatching(UUID_PATTERN) as string,
      timestamp: expect.stringMatching(UTC_TIMESTAMP_PATTERN) as string,
    });
  });
});
