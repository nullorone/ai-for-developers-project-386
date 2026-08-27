import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { OwnerBookingRecord } from './owner.types';

const BOOKING_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  guestName: true,
  guestEmail: true,
  createdAt: true,
  rescheduledAt: true,
} as const;

@Injectable()
export class OwnerRepository {
  constructor(private readonly prisma: PrismaService) {}

  listFuture(calendarId: string, now: Date): Promise<OwnerBookingRecord[]> {
    return this.prisma.booking.findMany({
      where: { calendarId, status: 'CONFIRMED', startsAt: { gt: now } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: BOOKING_SELECT,
    });
  }

  findBooking(calendarId: string, bookingId: string): Promise<OwnerBookingRecord | null> {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, calendarId },
      select: BOOKING_SELECT,
    });
  }

  async isInsideAvailability(calendarId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const found = await this.prisma.availabilityWindow.findFirst({
      where: { calendarId, startsAt: { lte: startsAt }, endsAt: { gte: endsAt } },
      select: { id: true },
    });
    return found !== null;
  }
}
