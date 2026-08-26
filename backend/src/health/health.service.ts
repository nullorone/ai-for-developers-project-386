import { Injectable } from '@nestjs/common';

import { toUtcTimestamp, type HealthStatus } from '../common/contract';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /health/live`: подтверждает, что процесс жив. Зависимости не проверяются,
   * поэтому `checks` пуст, а `503` не возвращается никогда.
   */
  live(): HealthStatus {
    return { status: 'up', checks: [], timestamp: toUtcTimestamp() };
  }

  /**
   * `GET /health/ready`: учитывает доступность PostgreSQL (правило N-18).
   * RabbitMQ в проверку не входит: его недоступность не блокирует запись в базу
   * благодаря transactional outbox (этап 7).
   */
  async ready(): Promise<HealthStatus> {
    const databaseUp = await this.prisma.isReachable();

    return {
      status: databaseUp ? 'up' : 'down',
      checks: [{ name: 'database', status: databaseUp ? 'up' : 'down' }],
      timestamp: toUtcTimestamp(),
    };
  }

  /** `GET /health`: агрегированное состояние. В MVP совпадает с готовностью. */
  async overall(): Promise<HealthStatus> {
    return this.ready();
  }
}
