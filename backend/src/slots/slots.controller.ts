import { Controller, Get, Param, Query } from '@nestjs/common';

import { SlotRangeDto } from './slot-range.dto';
import type { SlotListDto } from './slot.types';
import { SlotsService } from './slots.service';

@Controller('calendars/:slug/slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  list(@Param('slug') slug: string, @Query() range: SlotRangeDto): Promise<SlotListDto> {
    return this.slots.listPublic(slug, range);
  }
}
