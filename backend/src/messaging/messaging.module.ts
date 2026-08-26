import { Module } from '@nestjs/common';

/**
 * Transactional outbox и publisher RabbitMQ: `booking.created`, `booking.cancelled`, `booking.rescheduled` (этап 7).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 7.
 */
@Module({})
export class MessagingModule {}
