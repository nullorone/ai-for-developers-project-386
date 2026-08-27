import { Module } from '@nestjs/common';

import { CalendarsModule } from '../calendars/calendars.module';
import { BookingsController } from './bookings.controller';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';
import { IdempotencyCryptoService } from './idempotency-crypto.service';
import { TokenRateLimitGuard } from './token-rate-limit.guard';

/**
 * Создание, просмотр и отмена бронирования по management token (правила B-*, C-*, M-*).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 6.
 */
@Module({
  imports: [CalendarsModule],
  controllers: [BookingsController],
  providers: [BookingsRepository, BookingsService, IdempotencyCryptoService, TokenRateLimitGuard],
  exports: [BookingsRepository],
})
export class BookingsModule {}
