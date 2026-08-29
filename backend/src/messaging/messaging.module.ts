import { Module } from '@nestjs/common';

import { MessagingMetricsService } from './messaging-metrics.service';
import { OutboxPublisherService } from './outbox-publisher.service';
import { RabbitMqService } from './rabbitmq.service';

/**
 * Transactional outbox и publisher RabbitMQ: `booking.created`, `booking.cancelled`, `booking.rescheduled` (этап 7).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 7.
 */
@Module({
  providers: [RabbitMqService, MessagingMetricsService, OutboxPublisherService],
  exports: [RabbitMqService, MessagingMetricsService, OutboxPublisherService],
})
export class MessagingModule {}
