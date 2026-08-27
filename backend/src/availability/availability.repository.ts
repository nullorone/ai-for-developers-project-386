import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type {
  AvailabilityWindowRecord,
  CreateWindowResult,
  DeleteWindowResult,
} from './availability.types';

@Injectable()
export class AvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(calendarId: string): Promise<AvailabilityWindowRecord[]> {
    return this.prisma.availabilityWindow.findMany({
      where: { calendarId },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: { id: true, startsAt: true, endsAt: true, createdAt: true },
    });
  }

  async createAtomic(
    calendarId: string,
    startsAt: Date,
    endsAt: Date,
    maxWindows: number,
  ): Promise<CreateWindowResult> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes the count limit and gives deterministic overlap details.
      // The exclusion constraint remains the final A-5 defense for all writers.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${calendarId}))`;
      const count = await tx.availabilityWindow.count({ where: { calendarId } });
      if (count >= maxWindows) return { kind: 'limit' };

      const overlap = await tx.availabilityWindow.findFirst({
        where: { calendarId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
        orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true, endsAt: true, createdAt: true },
      });
      if (overlap) return { kind: 'overlap', window: overlap };

      const window = await tx.availabilityWindow.create({
        data: { calendarId, startsAt, endsAt },
        select: { id: true, startsAt: true, endsAt: true, createdAt: true },
      });
      return { kind: 'created', window };
    });
  }

  async deleteAtomic(calendarId: string, windowId: string, now: Date): Promise<DeleteWindowResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`calendar:${calendarId}`}, 0))`;
      const window = await tx.availabilityWindow.findFirst({
        where: { id: windowId, calendarId },
        select: { id: true, startsAt: true, endsAt: true },
      });
      if (!window) return { kind: 'notFound' };

      const bookingCount = await tx.booking.count({
        where: {
          calendarId,
          status: 'CONFIRMED',
          startsAt: { gt: now, lt: window.endsAt },
          endsAt: { gt: window.startsAt },
        },
      });
      if (bookingCount > 0) return { kind: 'hasBookings', count: bookingCount };

      await tx.availabilityWindow.delete({ where: { id: window.id } });
      return { kind: 'deleted' };
    });
  }
}
