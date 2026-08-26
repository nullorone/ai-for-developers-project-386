import { Module } from '@nestjs/common';

/**
 * Интервалы доступности владельца: `GET/POST /owner/availability`, `DELETE /owner/availability/{windowId}` (правила A-3…A-9).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 5.
 */
@Module({})
export class AvailabilityModule {}
