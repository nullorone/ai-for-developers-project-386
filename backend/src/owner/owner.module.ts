import { Module } from '@nestjs/common';

/**
 * Список будущих встреч и перенос: `GET /owner/bookings`, `PATCH /owner/bookings/{bookingId}/schedule` (правила R-*).
 *
 * Заготовка этапа 3: модуль зарегистрирован, но контроллеров, провайдеров
 * и бизнес-логики не содержит — они появляются на этапе 6.
 */
@Module({})
export class OwnerModule {}
