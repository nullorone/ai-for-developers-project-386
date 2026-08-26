import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Тонкая обертка над Prisma Client.
 *
 * Соединение намеренно ленивое: `$connect` не вызывается в `onModuleInit`,
 * поэтому приложение поднимается и отвечает на пробу живости даже без базы.
 * Готовность к трафику проверяет `/health/ready` (правило N-18) — реальная
 * проверка появится вместе с моделями данных на этапе 5.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma client disconnected');
  }

  /** Дешевая проверка доступности PostgreSQL для health-проб. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
