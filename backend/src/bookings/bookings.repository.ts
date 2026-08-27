import { createHash, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { CalendarRecord } from '../calendars/calendar.types';
import { PrismaService } from '../prisma/prisma.service';
import type { OwnerBookingRecord } from '../owner/owner.types';
import type { BookingCancellationRecord, BookingCreatedDto } from './booking.types';
import { IdempotencyCryptoService } from './idempotency-crypto.service';

const CREATE_OPERATION = 'CreateBooking';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const BOOKING_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  managementTokenHash: true,
  cancelledAt: true,
  rescheduledAt: true,
  calendar: { select: { title: true } },
} as const;
const OWNER_BOOKING_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  guestName: true,
  guestEmail: true,
  createdAt: true,
  rescheduledAt: true,
} as const;

export type AtomicCreateResult =
  | { kind: 'created'; response: BookingCreatedDto }
  | { kind: 'replayed'; response: BookingCreatedDto }
  | { kind: 'idempotencyReused' }
  | { kind: 'invalidTime'; reason: 'leadTime' | 'horizon' }
  | { kind: 'outsideAvailability' }
  | { kind: 'slotTaken' };

export type AtomicCancellationResult =
  | { kind: 'invalidToken' }
  | { kind: 'alreadyStarted' }
  | { kind: 'cancelled' | 'unchanged'; booking: BookingCancellationRecord };

export type AtomicRescheduleResult =
  | { kind: 'notFound' }
  | { kind: 'notReschedulable'; reason: 'cancelled' | 'started' }
  | { kind: 'invalidTime'; reason: 'leadTime' | 'horizon' }
  | { kind: 'outsideAvailability' }
  | { kind: 'slotTaken' }
  | { kind: 'rescheduled' | 'unchanged'; booking: OwnerBookingRecord };

interface AtomicCreateInput {
  calendar: CalendarRecord;
  startsAt: Date;
  endsAt: Date;
  guestName: string;
  guestEmail: string;
  comment: string | null;
  managementToken: string;
  managementTokenHash: string;
  idempotencyKeyHash: string | null;
  requestHash: string;
  now: Date;
}

@Injectable()
export class BookingsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyCrypto: IdempotencyCryptoService,
  ) {}

  async createAtomic(input: AtomicCreateInput): Promise<AtomicCreateResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Opportunistic TTL cleanup keeps encrypted responses short-lived on active systems.
        await tx.idempotencyRecord.deleteMany({ where: { expiresAt: { lte: input.now } } });
        if (input.idempotencyKeyHash) {
          await this.lock(tx, `idempotency:${input.calendar.id}:${input.idempotencyKeyHash}`);
          const stored = await tx.idempotencyRecord.findUnique({
            where: {
              idempotencyScopeKey: {
                calendarId: input.calendar.id,
                operation: CREATE_OPERATION,
                keyHash: input.idempotencyKeyHash,
              },
            },
          });
          if (stored && stored.expiresAt > input.now) {
            if (stored.requestHash !== input.requestHash) return { kind: 'idempotencyReused' };
            return {
              kind: 'replayed',
              response: this.idempotencyCrypto.decrypt({
                ciphertext: stored.responseCiphertext,
                iv: stored.responseIv,
                authTag: stored.responseAuthTag,
              }),
            };
          }
          if (stored) await tx.idempotencyRecord.delete({ where: { id: stored.id } });
        }

        if (
          input.startsAt.getTime() <
          input.now.getTime() + input.calendar.minimumLeadTimeMinutes * 60_000
        ) {
          return { kind: 'invalidTime', reason: 'leadTime' };
        }
        if (
          input.startsAt.getTime() >
          input.now.getTime() + input.calendar.bookingHorizonDays * 24 * 60 * 60 * 1000
        ) {
          return { kind: 'invalidTime', reason: 'horizon' };
        }

        await this.lock(tx, `calendar:${input.calendar.id}`);
        const availability = await tx.availabilityWindow.findFirst({
          where: {
            calendarId: input.calendar.id,
            startsAt: { lte: input.startsAt },
            endsAt: { gte: input.endsAt },
          },
          select: { id: true },
        });
        if (!availability) return { kind: 'outsideAvailability' };

        const booking = await tx.booking.create({
          data: {
            calendarId: input.calendar.id,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            guestName: input.guestName,
            guestEmail: input.guestEmail,
            comment: input.comment,
            managementTokenHash: input.managementTokenHash,
          },
          select: { id: true, createdAt: true },
        });
        await tx.slotReservation.create({
          data: {
            calendarId: input.calendar.id,
            bookingId: booking.id,
            startsAt: input.startsAt,
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Booking',
            aggregateId: booking.id,
            eventType: 'booking.created',
            payload: {
              bookingId: booking.id,
              calendarId: input.calendar.id,
              startsAt: input.startsAt.toISOString(),
              endsAt: input.endsAt.toISOString(),
            },
          },
        });
        const response: BookingCreatedDto = {
          id: booking.id,
          calendarId: input.calendar.id,
          calendarSlug: input.calendar.slug,
          calendarTitle: input.calendar.title,
          startsAt: this.timestamp(input.startsAt),
          endsAt: this.timestamp(input.endsAt),
          durationMinutes: 30,
          status: 'CONFIRMED',
          createdAt: this.timestamp(booking.createdAt),
          managementToken: input.managementToken,
          managementPath: `/bookings/${booking.id}`,
        };
        if (input.idempotencyKeyHash) {
          const encrypted = this.idempotencyCrypto.encrypt(response);
          await tx.idempotencyRecord.create({
            data: {
              calendarId: input.calendar.id,
              operation: CREATE_OPERATION,
              keyHash: input.idempotencyKeyHash,
              requestHash: input.requestHash,
              responseCiphertext: encrypted.ciphertext,
              responseIv: encrypted.iv,
              responseAuthTag: encrypted.authTag,
              expiresAt: new Date(input.now.getTime() + IDEMPOTENCY_TTL_MS),
            },
          });
        }
        return { kind: 'created', response };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) return { kind: 'slotTaken' };
      throw error;
    }
  }

  findCancellation(bookingId: string): Promise<BookingCancellationRecord | null> {
    return this.prisma.booking.findUnique({ where: { id: bookingId }, select: BOOKING_SELECT });
  }

  async cancelAtomic(
    bookingId: string,
    presentedTokenHash: string,
    now: Date,
  ): Promise<AtomicCancellationResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `booking:${bookingId}`);
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: BOOKING_SELECT,
      });
      const tokenMatches = this.tokenMatches(booking?.managementTokenHash, presentedTokenHash);
      if (!booking || !tokenMatches) {
        return { kind: 'invalidToken' };
      }
      if (booking.status === 'CANCELLED') return { kind: 'unchanged', booking };
      if (booking.startsAt <= now) return { kind: 'alreadyStarted' };

      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED', cancelledAt: now },
        select: BOOKING_SELECT,
      });
      await tx.slotReservation.deleteMany({ where: { bookingId: booking.id, status: 'ACTIVE' } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Booking',
          aggregateId: booking.id,
          eventType: 'booking.cancelled',
          payload: { bookingId: booking.id, cancelledAt: now.toISOString() },
        },
      });
      return { kind: 'cancelled', booking: updated };
    });
  }

  async rescheduleAtomic(
    calendarId: string,
    bookingId: string,
    startsAt: Date,
    endsAt: Date,
    now: Date,
    minimumLeadTimeMinutes: number,
    bookingHorizonDays: number,
  ): Promise<AtomicRescheduleResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `booking:${bookingId}`);
        const booking = await tx.booking.findFirst({
          where: { id: bookingId, calendarId },
          select: OWNER_BOOKING_SELECT,
        });
        if (!booking) return { kind: 'notFound' };
        if (booking.status === 'CANCELLED') {
          return { kind: 'notReschedulable', reason: 'cancelled' };
        }
        if (booking.startsAt <= now) return { kind: 'notReschedulable', reason: 'started' };
        if (booking.startsAt.getTime() === startsAt.getTime()) {
          return { kind: 'unchanged', booking };
        }
        if (startsAt.getTime() < now.getTime() + minimumLeadTimeMinutes * 60_000) {
          return { kind: 'invalidTime', reason: 'leadTime' };
        }
        if (startsAt.getTime() > now.getTime() + bookingHorizonDays * 24 * 60 * 60 * 1000) {
          return { kind: 'invalidTime', reason: 'horizon' };
        }

        await this.lock(tx, `calendar:${calendarId}`);
        const availability = await tx.availabilityWindow.findFirst({
          where: { calendarId, startsAt: { lte: startsAt }, endsAt: { gte: endsAt } },
          select: { id: true },
        });
        if (!availability) return { kind: 'outsideAvailability' };

        await tx.slotReservation.updateMany({
          where: { bookingId, status: 'ACTIVE' },
          data: { status: 'RELEASED', releasedAt: now },
        });
        await tx.slotReservation.create({ data: { calendarId, bookingId, startsAt } });
        const updated = await tx.booking.update({
          where: { id: bookingId },
          data: { startsAt, endsAt, rescheduledAt: now },
          select: OWNER_BOOKING_SELECT,
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Booking',
            aggregateId: bookingId,
            eventType: 'booking.rescheduled',
            payload: {
              bookingId,
              previousStartsAt: booking.startsAt.toISOString(),
              previousEndsAt: booking.endsAt.toISOString(),
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              rescheduledAt: now.toISOString(),
            },
          },
        });
        return { kind: 'rescheduled', booking: updated };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) return { kind: 'slotTaken' };
      throw error;
    }
  }

  private lock(tx: Prisma.TransactionClient, key: string): Promise<number> {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  private tokenMatches(expected: string | undefined, presented: string): boolean {
    const safeExpected = expected ?? createHash('sha256').update('missing-booking').digest('hex');
    return (
      timingSafeEqual(Buffer.from(safeExpected, 'hex'), Buffer.from(presented, 'hex')) && !!expected
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private timestamp(value: Date): string {
    return `${value.toISOString().slice(0, 19)}Z`;
  }
}
