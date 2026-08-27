import { HttpStatus, Injectable } from '@nestjs/common';

import { CalendarRepository } from '../calendars/calendar.repository';
import type { CalendarRecord } from '../calendars/calendar.types';
import { toUtcTimestamp } from '../common/contract';
import { ContractException } from '../common/errors/contract.exception';
import { Clock } from '../common/time/clock';
import { SlotGeneratorService } from './slot-generator.service';
import type { SlotRangeDto } from './slot-range.dto';
import type { SlotListDto, TimeRange } from './slot.types';
import { SlotsRepository } from './slots.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SlotsService {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly slots: SlotsRepository,
    private readonly generator: SlotGeneratorService,
    private readonly clock: Clock,
  ) {}

  async listPublic(slug: string, input: SlotRangeDto): Promise<SlotListDto> {
    const calendar = await this.calendars.findBySlug(slug);
    if (!calendar) {
      throw new ContractException({
        code: 'CALENDAR_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
        message: 'Calendar not found.',
      });
    }
    const now = this.clock.now();
    const range = this.validateRange(input.from, input.to, now, calendar.bookingHorizonDays);
    const generated = await this.calculate(calendar, range, now);
    return {
      calendarId: calendar.id,
      from: toUtcTimestamp(range.startsAt),
      to: toUtcTimestamp(range.endsAt),
      slotDurationMinutes: 30,
      generatedAt: toUtcTimestamp(now),
      slots: generated.map((slot) => ({
        startsAt: toUtcTimestamp(slot.startsAt),
        endsAt: toUtcTimestamp(slot.endsAt),
      })),
    };
  }

  async calculate(calendar: CalendarRecord, range: TimeRange, now: Date): Promise<TimeRange[]> {
    const inputs = await this.slots.queryInputs(calendar.id, range.startsAt, range.endsAt);
    return this.generator.generate({
      range,
      availability: inputs.availability,
      activeReservationStarts: inputs.activeReservationStarts,
      earliestStart: new Date(now.getTime() + calendar.minimumLeadTimeMinutes * 60_000),
    });
  }

  validateRange(fromValue: string, toValue: string, now: Date, horizonDays = 90): TimeRange {
    const from = new Date(fromValue);
    const to = new Date(toValue);
    if (Number.isNaN(from.getTime()))
      this.invalidRange('from', 'T-1', 'Timestamp is not a valid UTC date.');
    if (Number.isNaN(to.getTime()))
      this.invalidRange('to', 'T-1', 'Timestamp is not a valid UTC date.');
    if (to <= from) this.invalidRange('to', 'S-5', '"to" must be later than "from".');
    if (to.getTime() - from.getTime() > 31 * DAY_MS)
      this.invalidRange('to', 'S-5', 'Range between "from" and "to" must not exceed 31 days.');
    if (from.getTime() < now.getTime() - DAY_MS)
      this.invalidRange('from', 'S-5', '"from" must not be earlier than one day before now.');
    if (to.getTime() > now.getTime() + horizonDays * DAY_MS)
      this.invalidRange('to', 'S-5', `"to" must not be later than ${horizonDays} days after now.`);
    return { startsAt: from, endsAt: to };
  }

  private invalidRange(field: string, rule: string, message: string): never {
    throw new ContractException({
      code: 'VALIDATION_ERROR',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      message: 'Request range is invalid.',
      details: [{ location: 'query', field, rule, message }],
    });
  }
}
