import { Injectable } from '@nestjs/common';

import { toUtcTimestamp, type HealthStatus } from '../common/contract';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
  ) {}

  /**
   * `GET /health/live`: подтверждает, что процесс жив. Зависимости не проверяются,
   * поэтому `checks` пуст, а `503` не возвращается никогда.
   */
  live(): HealthStatus {
    return { status: 'up', checks: [], timestamp: toUtcTimestamp() };
  }

  /**
   * RabbitMQ виден в readiness, но его сбой не затрагивает HTTP-транзакцию Booking:
   * события остаются в PostgreSQL outbox до восстановления broker.
   */
  async ready(): Promise<HealthStatus> {
    const databaseUp = await this.prisma.isReachable();
    const brokerUp = this.rabbit.isReachable();
    const checks: HealthStatus['checks'] = [
      { name: 'database', status: databaseUp ? 'up' : 'down' },
    ];
    if (this.rabbit.enabled) {
      checks.push({ name: 'messageBroker', status: brokerUp ? 'up' : 'down' });
    }

    return {
      status: databaseUp && brokerUp ? 'up' : 'down',
      checks,
      timestamp: toUtcTimestamp(),
    };
  }

  /** `GET /health`: агрегированное состояние. В MVP совпадает с готовностью. */
  async overall(): Promise<HealthStatus> {
    return this.ready();
  }
}
