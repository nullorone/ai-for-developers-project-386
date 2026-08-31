import { Module } from '@nestjs/common';

import { TokenRateLimitGuard } from '../bookings/token-rate-limit.guard';
import { CalendarsModule } from '../calendars/calendars.module';
import { SlotGeneratorService } from './slot-generator.service';
import { SlotsController } from './slots.controller';
import { SlotsRepository } from './slots.repository';
import { SlotsService } from './slots.service';

/**
 * Генерация свободных 30-минутных слотов: `GET /calendars/{slug}/slots` (правила S-1…S-8).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 5.
 */
@Module({
  imports: [CalendarsModule],
  controllers: [SlotsController],
  providers: [SlotsRepository, SlotGeneratorService, SlotsService, TokenRateLimitGuard],
  exports: [SlotsService],
})
export class SlotsModule {}
