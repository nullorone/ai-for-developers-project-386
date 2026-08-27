import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { CalendarRepository } from '../calendars/calendar.repository';
import { toUtcTimestamp } from '../common/contract';
import { ContractException } from '../common/errors/contract.exception';
import { Clock } from '../common/time/clock';
import type {
  BookingCancellationDto,
  BookingCancellationRecord,
  CreateBookingResult,
} from './booking.types';
import { BookingsRepository } from './bookings.repository';
import type { CreateBookingDto } from './create-booking.dto';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._~-]{16,128}$/;
const MANAGEMENT_TOKEN = /^[A-Za-z0-9_-]{22,128}$/;

@Injectable()
export class BookingsService {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly bookings: BookingsRepository,
    private readonly clock: Clock,
  ) {}

  async create(
    slug: string,
    input: CreateBookingDto,
    idempotencyKey?: string,
  ): Promise<CreateBookingResult> {
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new ContractException({
        code: 'VALIDATION_ERROR',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Request header is invalid.',
        details: [
          {
            location: 'header',
            field: 'Idempotency-Key',
            rule: 'B-7',
            message: 'Idempotency-Key must contain 16–128 URL-safe characters.',
          },
        ],
      });
    }
    const calendar = await this.calendars.findBySlug(slug);
    if (!calendar) {
      throw new ContractException({
        code: 'CALENDAR_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
        message: 'Calendar not found.',
      });
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const managementToken = randomBytes(32).toString('base64url');
    const normalized = {
      startsAt: input.startsAt,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      comment: input.comment ?? null,
    };
    const result = await this.bookings.createAtomic({
      calendar,
      startsAt,
      endsAt,
      guestName: normalized.guestName,
      guestEmail: normalized.guestEmail,
      comment: normalized.comment,
      managementToken,
      managementTokenHash: this.hash(managementToken),
      idempotencyKeyHash: idempotencyKey ? this.hash(idempotencyKey) : null,
      requestHash: this.hash(JSON.stringify(normalized)),
      now: this.clock.now(),
    });

    if (result.kind === 'created') return { booking: result.response, replayed: false };
    if (result.kind === 'replayed') return { booking: result.response, replayed: true };
    if (result.kind === 'idempotencyReused') {
      throw new ContractException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        status: HttpStatus.CONFLICT,
        message: 'Idempotency-Key was already used with a different request body.',
        details: [
          {
            location: 'header',
            field: 'Idempotency-Key',
            rule: 'B-7',
            message: 'Use a new key for a new booking attempt.',
          },
        ],
      });
    }
    if (result.kind === 'slotTaken') this.slotTaken();
    if (result.kind === 'outsideAvailability') {
      this.invalidSlot('B-1', 'Slot is not inside a published availability window.');
    }
    this.invalidSlot(
      result.reason === 'leadTime' ? 'B-3' : 'B-4',
      result.reason === 'leadTime'
        ? 'Slot must start at least 60 minutes from now.'
        : 'Slot must not start beyond the 90-day booking horizon.',
    );
  }

  async getCancellation(
    bookingId: string,
    token: string | undefined,
  ): Promise<BookingCancellationDto> {
    const tokenHash = this.validTokenHash(token);
    const booking = await this.bookings.findCancellation(bookingId);
    const matches = this.matches(booking?.managementTokenHash, tokenHash);
    if (!booking || !matches) this.invalidToken();
    return this.mapCancellation(booking, this.clock.now());
  }

  async cancel(bookingId: string, token: string | undefined): Promise<BookingCancellationDto> {
    const tokenHash = this.validTokenHash(token);
    const now = this.clock.now();
    const result = await this.bookings.cancelAtomic(bookingId, tokenHash, now);
    if (result.kind === 'invalidToken') this.invalidToken();
    if (result.kind === 'alreadyStarted') {
      throw new ContractException({
        code: 'BOOKING_ALREADY_STARTED',
        status: HttpStatus.CONFLICT,
        message: 'A booking that has already started cannot be cancelled.',
        details: [
          {
            location: 'path',
            field: 'bookingId',
            rule: 'C-3',
            message: 'Cancellation is allowed only before the meeting starts.',
          },
        ],
      });
    }
    return this.mapCancellation(result.booking, now);
  }

  private mapCancellation(booking: BookingCancellationRecord, now: Date): BookingCancellationDto {
    return {
      id: booking.id,
      calendarTitle: booking.calendar.title,
      startsAt: toUtcTimestamp(booking.startsAt),
      endsAt: toUtcTimestamp(booking.endsAt),
      durationMinutes: 30,
      status: booking.status,
      cancelledAt: booking.cancelledAt ? toUtcTimestamp(booking.cancelledAt) : null,
      rescheduledAt: booking.rescheduledAt ? toUtcTimestamp(booking.rescheduledAt) : null,
      cancellable: booking.status === 'CONFIRMED' && booking.startsAt > now,
    };
  }

  private validTokenHash(token: string | undefined): string {
    if (!token || !MANAGEMENT_TOKEN.test(token)) this.invalidToken();
    return this.hash(token);
  }

  private matches(expected: string | undefined, presented: string): boolean {
    const fallback = this.hash('missing-booking');
    return (
      timingSafeEqual(Buffer.from(expected ?? fallback, 'hex'), Buffer.from(presented, 'hex')) &&
      !!expected
    );
  }

  private invalidToken(): never {
    throw new ContractException({
      code: 'BOOKING_TOKEN_INVALID',
      status: HttpStatus.FORBIDDEN,
      message: 'Booking token is invalid.',
    });
  }

  private slotTaken(): never {
    throw new ContractException({
      code: 'SLOT_TAKEN',
      status: HttpStatus.CONFLICT,
      message: 'The requested slot is no longer available.',
      details: [
        {
          location: 'body',
          field: 'startsAt',
          rule: 'B-5',
          message: 'An active booking already exists for this slot.',
        },
      ],
    });
  }

  private invalidSlot(rule: string, message: string): never {
    throw new ContractException({
      code: 'VALIDATION_ERROR',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      message: 'Request body is invalid.',
      details: [{ location: 'body', field: 'startsAt', rule, message }],
    });
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
