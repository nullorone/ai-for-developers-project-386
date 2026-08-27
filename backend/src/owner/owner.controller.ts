import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type { OwnerBookingListDto, RescheduleSlotListDto } from './owner.types';
import { RescheduleRangeDto } from './reschedule-range.dto';
import { OwnerService } from './owner.service';

@Controller('owner/bookings')
export class OwnerController {
  constructor(private readonly owner: OwnerService) {}

  @Get()
  listBookings(): Promise<OwnerBookingListDto> {
    return this.owner.listBookings();
  }

  @Get(':bookingId/available-slots')
  listRescheduleSlots(
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Query() range: RescheduleRangeDto,
  ): Promise<RescheduleSlotListDto> {
    return this.owner.listRescheduleSlots(bookingId, range);
  }
}
