import { Module } from '@nestjs/common';

import { TokenRateLimitGuard } from '../bookings/token-rate-limit.guard';
import { CalendarsModule } from '../calendars/calendars.module';
import { AvailabilityController } from './availability.controller';
import { AvailabilityRepository } from './availability.repository';
import { AvailabilityService } from './availability.service';

/**
 * Интервалы доступности владельца: `GET/POST /owner/availability`, `DELETE /owner/availability/{windowId}` (правила A-3…A-9).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 5.
 */
@Module({
  imports: [CalendarsModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityRepository, AvailabilityService, TokenRateLimitGuard],
  exports: [AvailabilityRepository],
})
export class AvailabilityModule {}
