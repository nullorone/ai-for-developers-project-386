import { Controller, Get, Param } from '@nestjs/common';

import type { CalendarDto } from './calendar.types';
import { CalendarsService } from './calendars.service';

@Controller('calendars')
export class CalendarsController {
  constructor(private readonly calendars: CalendarsService) {}

  @Get(':slug')
  getBySlug(@Param('slug') slug: string): Promise<CalendarDto> {
    return this.calendars.getBySlug(slug);
  }
}
