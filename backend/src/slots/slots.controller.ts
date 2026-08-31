import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { TokenRateLimitGuard } from '../bookings/token-rate-limit.guard';

import { SlotRangeDto } from './slot-range.dto';
import type { SlotListDto } from './slot.types';
import { SlotsService } from './slots.service';

@Controller('calendars/:slug/slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @UseGuards(TokenRateLimitGuard)
  list(@Param('slug') slug: string, @Query() range: SlotRangeDto): Promise<SlotListDto> {
    return this.slots.listPublic(slug, range);
  }
}
