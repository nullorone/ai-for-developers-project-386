import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CalendarRecord } from './calendar.types';

@Injectable()
export class CalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(slug: string): Promise<CalendarRecord | null> {
    return this.prisma.calendar.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        ownerTimeZone: true,
        slotDurationMinutes: true,
        minimumLeadTimeMinutes: true,
        bookingHorizonDays: true,
      },
    });
  }

  findOnly(): Promise<CalendarRecord | null> {
    return this.prisma.calendar.findFirst({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        ownerTimeZone: true,
        slotDurationMinutes: true,
        minimumLeadTimeMinutes: true,
        bookingHorizonDays: true,
      },
    });
  }
}
