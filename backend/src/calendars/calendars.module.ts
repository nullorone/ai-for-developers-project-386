import { Module } from '@nestjs/common';

import { CalendarRepository } from './calendar.repository';
import { CalendarsController } from './calendars.controller';
import { CalendarsService } from './calendars.service';

/**
 * Публичный календарь: `GET /calendars/{slug}` (правило A-1, один seed-календарь).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 5.
 */
@Module({
  controllers: [CalendarsController],
  providers: [CalendarRepository, CalendarsService],
  exports: [CalendarRepository],
})
export class CalendarsModule {}
