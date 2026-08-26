import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { CalendarsModule } from './calendars/calendars.module';
import { validateEnv } from './common/config/env.schema';
import { HealthModule } from './health/health.module';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OwnerModule } from './owner/owner.module';
import { PrismaModule } from './prisma/prisma.module';
import { SlotsModule } from './slots/slots.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    // Заготовки доменных модулей из llm/00-project-overview.md.
    CalendarsModule,
    AvailabilityModule,
    SlotsModule,
    BookingsModule,
    OwnerModule,
    MessagingModule,
    NotificationsModule,
  ],
})
export class AppModule {}
