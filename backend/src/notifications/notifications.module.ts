import { Module } from '@nestjs/common';

import { MessagingModule } from '../messaging/messaging.module';
import { NotificationConsumerService } from './notification-consumer.service';

/**
 * Идемпотентный consumer уведомлений и `NotificationLog` (этап 7).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 7.
 */
@Module({
  imports: [MessagingModule],
  providers: [NotificationConsumerService],
  exports: [NotificationConsumerService],
})
export class NotificationsModule {}
