import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { TokenRateLimitGuard } from '../bookings/token-rate-limit.guard';

import type { CalendarDto } from './calendar.types';
import { CalendarsService } from './calendars.service';

@Controller('calendars')
export class CalendarsController {
  constructor(private readonly calendars: CalendarsService) {}

  @Get(':slug')
  @UseGuards(TokenRateLimitGuard)
  getBySlug(@Param('slug') slug: string): Promise<CalendarDto> {
    return this.calendars.getBySlug(slug);
  }
}
