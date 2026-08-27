import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { TimeRange } from './slot.types';

@Injectable()
export class SlotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async queryInputs(
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<{
    availability: TimeRange[];
    activeReservationStarts: Date[];
  }> {
    const [availability, reservations] = await Promise.all([
      this.prisma.availabilityWindow.findMany({
        where: { calendarId, startsAt: { lt: to }, endsAt: { gt: from } },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.slotReservation.findMany({
        where: { calendarId, status: 'ACTIVE', startsAt: { gte: from, lt: to } },
        select: { startsAt: true },
      }),
    ]);
    return { availability, activeReservationStarts: reservations.map((item) => item.startsAt) };
  }
}
