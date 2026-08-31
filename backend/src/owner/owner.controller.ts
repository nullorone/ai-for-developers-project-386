import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { TokenRateLimitGuard } from '../bookings/token-rate-limit.guard';
import type { OwnerBookingDto, OwnerBookingListDto, RescheduleSlotListDto } from './owner.types';
import { RescheduleBookingDto } from './reschedule-booking.dto';
import { RescheduleRangeDto } from './reschedule-range.dto';
import { OwnerService } from './owner.service';

@Controller('owner/bookings')
@UseGuards(TokenRateLimitGuard)
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

  @Patch(':bookingId/schedule')
  reschedule(
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Body() input: RescheduleBookingDto,
  ): Promise<OwnerBookingDto> {
    return this.owner.reschedule(bookingId, input);
  }
}
