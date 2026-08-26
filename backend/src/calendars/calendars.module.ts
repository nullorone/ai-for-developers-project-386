import { Module } from '@nestjs/common';

/**
 * Публичный календарь: `GET /calendars/{slug}` (правило A-1, один seed-календарь).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 5.
 */
@Module({})
export class CalendarsModule {}
