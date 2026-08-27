import { HttpStatus, Injectable } from '@nestjs/common';

import { CalendarRepository } from '../calendars/calendar.repository';
import { toUtcTimestamp } from '../common/contract';
import { ContractException } from '../common/errors/contract.exception';
import { Clock } from '../common/time/clock';
import { SlotsService } from '../slots/slots.service';
import { OwnerRepository } from './owner.repository';
import type { RescheduleRangeDto } from './reschedule-range.dto';
import type {
  OwnerBookingDto,
  OwnerBookingListDto,
  OwnerBookingRecord,
  RescheduleSlotListDto,
} from './owner.types';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OwnerService {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly bookings: OwnerRepository,
    private readonly slots: SlotsService,
    private readonly clock: Clock,
  ) {}

  async listBookings(): Promise<OwnerBookingListDto> {
    const calendar = await this.onlyCalendar();
    const now = this.clock.now();
    const bookings = await this.bookings.listFuture(calendar.id, now);
    return {
      calendarId: calendar.id,
      total: bookings.length,
      generatedAt: toUtcTimestamp(now),
      items: bookings.map((item) => this.mapBooking(item)),
    };
  }

  async listRescheduleSlots(
    bookingId: string,
    input: RescheduleRangeDto,
  ): Promise<RescheduleSlotListDto> {
    const calendar = await this.onlyCalendar();
    const now = this.clock.now();
    const booking = await this.bookings.findBooking(calendar.id, bookingId);
    if (!booking)
      throw new ContractException({
        code: 'BOOKING_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
        message: 'Booking not found.',
      });
    if (booking.status !== 'CONFIRMED' || booking.startsAt <= now) {
      throw new ContractException({
        code: 'BOOKING_NOT_RESCHEDULABLE',
        status: HttpStatus.CONFLICT,
        message: 'Only confirmed future bookings can be rescheduled.',
        details: [
          {
            location: 'path',
            field: 'bookingId',
            rule: 'R-1',
            message:
              booking.status === 'CANCELLED'
                ? 'Booking status is CANCELLED.'
                : 'Booking has already started.',
          },
        ],
      });
    }

    const fromValue = input.from ?? toUtcTimestamp(now);
    const toValue = input.to ?? toUtcTimestamp(new Date(now.getTime() + 30 * DAY_MS));
    const range = this.slots.validateRange(fromValue, toValue, now, calendar.bookingHorizonDays);
    const available = await this.slots.calculate(calendar, range, now);
    const currentInRange = booking.startsAt >= range.startsAt && booking.startsAt < range.endsAt;
    const currentPublished =
      currentInRange &&
      (await this.bookings.isInsideAvailability(calendar.id, booking.startsAt, booking.endsAt));

    const byStart = new Map(
      available.map((slot) => [slot.startsAt.getTime(), { ...slot, current: false }]),
    );
    if (currentPublished)
      byStart.set(booking.startsAt.getTime(), {
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        current: true,
      });
    const result = [...byStart.values()].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
    );

    return {
      bookingId: booking.id,
      currentStartsAt: toUtcTimestamp(booking.startsAt),
      from: toUtcTimestamp(range.startsAt),
      to: toUtcTimestamp(range.endsAt),
      slotDurationMinutes: 30,
      generatedAt: toUtcTimestamp(now),
      slots: result.map((slot) => ({
        startsAt: toUtcTimestamp(slot.startsAt),
        endsAt: toUtcTimestamp(slot.endsAt),
        current: slot.current,
      })),
    };
  }

  private async onlyCalendar() {
    const calendar = await this.calendars.findOnly();
    if (!calendar) throw new Error('Seed calendar is missing');
    return calendar;
  }

  private mapBooking(booking: OwnerBookingRecord): OwnerBookingDto {
    const at = booking.guestEmail.lastIndexOf('@');
    const masked =
      at > 0
        ? `${booking.guestEmail[0]}***${booking.guestEmail.slice(at)}`
        : `${booking.guestEmail[0] ?? '*'}***@invalid`;
    return {
      id: booking.id,
      startsAt: toUtcTimestamp(booking.startsAt),
      endsAt: toUtcTimestamp(booking.endsAt),
      durationMinutes: 30,
      status: booking.status,
      guestName: booking.guestName,
      guestEmailMasked: masked,
      createdAt: toUtcTimestamp(booking.createdAt),
      rescheduledAt: booking.rescheduledAt ? toUtcTimestamp(booking.rescheduledAt) : null,
    };
  }
}
