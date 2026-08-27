import { HttpStatus, Injectable } from '@nestjs/common';

import { ContractException } from '../common/errors/contract.exception';
import { CalendarRepository } from './calendar.repository';
import type { CalendarDto, CalendarRecord } from './calendar.types';

@Injectable()
export class CalendarsService {
  constructor(private readonly calendars: CalendarRepository) {}

  async getBySlug(slug: string): Promise<CalendarDto> {
    const calendar = await this.calendars.findBySlug(slug);
    if (!calendar) {
      throw new ContractException({
        code: 'CALENDAR_NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
        message: 'Calendar not found.',
      });
    }
    return this.map(calendar);
  }

  private map(calendar: CalendarRecord): CalendarDto {
    return { ...calendar };
  }
}
