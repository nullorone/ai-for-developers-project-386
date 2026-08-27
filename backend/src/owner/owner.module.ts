import { Module } from '@nestjs/common';

import { CalendarsModule } from '../calendars/calendars.module';
import { BookingsModule } from '../bookings/bookings.module';
import { SlotsModule } from '../slots/slots.module';
import { OwnerController } from './owner.controller';
import { OwnerRepository } from './owner.repository';
import { OwnerService } from './owner.service';

/**
 * Список будущих встреч и перенос: `GET /owner/bookings`, `PATCH /owner/bookings/{bookingId}/schedule` (правила R-*).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 6.
 */
@Module({
  imports: [CalendarsModule, SlotsModule, BookingsModule],
  controllers: [OwnerController],
  providers: [OwnerRepository, OwnerService],
})
export class OwnerModule {}
