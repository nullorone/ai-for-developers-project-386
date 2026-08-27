import { HttpStatus, Injectable } from '@nestjs/common';

import { CalendarRepository } from '../calendars/calendar.repository';
import { toUtcTimestamp } from '../common/contract';
import { ContractException } from '../common/errors/contract.exception';
import { Clock } from '../common/time/clock';
import { AvailabilityRepository } from './availability.repository';
import type {
  AvailabilityWindowDto,
  AvailabilityWindowListDto,
  AvailabilityWindowRecord,
} from './availability.types';
import type { CreateAvailabilityDto } from './create-availability.dto';

const MAX_WINDOWS = 500;
const MAX_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly calendars: CalendarRepository,
    private readonly windows: AvailabilityRepository,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<AvailabilityWindowListDto> {
    const calendar = await this.onlyCalendar();
    const items = await this.windows.list(calendar.id);
    return {
      calendarId: calendar.id,
      total: items.length,
      maxWindows: MAX_WINDOWS,
      items: items.map((item) => this.map(item)),
    };
  }

  async create(input: CreateAvailabilityDto): Promise<AvailabilityWindowDto> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const now = this.clock.now();

    if (endsAt <= startsAt) this.invalid('endsAt', 'A-4', 'endsAt must be later than startsAt.');
    if (endsAt <= now)
      this.invalid('endsAt', 'A-6', 'Availability window cannot be entirely in the past.');
    if (endsAt.getTime() - startsAt.getTime() > MAX_WINDOW_MS) {
      this.invalid('endsAt', 'A-7', 'Availability window must not exceed 14 days.');
    }

    const calendar = await this.onlyCalendar();
    const result = await this.windows.createAtomic(calendar.id, startsAt, endsAt, MAX_WINDOWS);
    if (result.kind === 'limit') {
      this.invalid(
        'startsAt',
        'A-8',
        'Calendar already contains the maximum of 500 availability windows.',
      );
    }
    if (result.kind === 'overlap') {
      throw new ContractException({
        code: 'AVAILABILITY_OVERLAP',
        status: HttpStatus.CONFLICT,
        message: 'Availability window overlaps an existing one.',
        details: [
          {
            location: 'body',
            field: 'startsAt',
            rule: 'A-5',
            message: `Overlapping window ${toUtcTimestamp(result.window.startsAt)}–${toUtcTimestamp(result.window.endsAt)} already exists.`,
          },
        ],
      });
    }
    return this.map(result.window);
  }

  async delete(windowId: string): Promise<void> {
    const calendar = await this.onlyCalendar();
    const result = await this.windows.deleteAtomic(calendar.id, windowId, this.clock.now());
    if (result.kind === 'notFound') {
      throw new ContractException({
        code: 'AVAILABILITY_WINDOW_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
        message: 'Availability window not found.',
      });
    }
    if (result.kind === 'hasBookings') {
      throw new ContractException({
        code: 'AVAILABILITY_WINDOW_HAS_BOOKINGS',
        status: HttpStatus.CONFLICT,
        message: 'Availability window still contains confirmed future bookings.',
        details: [
          {
            location: 'path',
            field: 'windowId',
            rule: 'A-9',
            message: `Reschedule ${result.count} confirmed bookings before deleting this window.`,
          },
        ],
      });
    }
  }

  private async onlyCalendar() {
    const calendar = await this.calendars.findOnly();
    if (!calendar) throw new Error('Seed calendar is missing');
    return calendar;
  }

  private invalid(field: string, rule: string, message: string): never {
    throw new ContractException({
      code: 'VALIDATION_ERROR',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      message: 'Request body is invalid.',
      details: [{ location: 'body', field, rule, message }],
    });
  }

  private map(window: AvailabilityWindowRecord): AvailabilityWindowDto {
    return {
      id: window.id,
      startsAt: toUtcTimestamp(window.startsAt),
      endsAt: toUtcTimestamp(window.endsAt),
      createdAt: toUtcTimestamp(window.createdAt),
    };
  }
}
