import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { BookingCancellationDto, BookingCreatedDto } from './booking.types';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './create-booking.dto';
import { TokenRateLimitGuard } from './token-rate-limit.guard';

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('calendars/:slug/bookings')
  @UseGuards(TokenRateLimitGuard)
  async create(
    @Param('slug') slug: string,
    @Body() input: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingCreatedDto> {
    const result = await this.bookings.create(slug, input, idempotencyKey);
    response.status(HttpStatus.CREATED);
    response.setHeader('Location', `/api/v1/bookings/${result.booking.id}/cancellation`);
    response.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.booking;
  }

  @Get('bookings/:bookingId/cancellation')
  @UseGuards(TokenRateLimitGuard)
  getCancellation(
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('x-booking-token') token: string | undefined,
  ): Promise<BookingCancellationDto> {
    return this.bookings.getCancellation(bookingId, token);
  }

  @Post('bookings/:bookingId/cancellation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TokenRateLimitGuard)
  cancel(
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('x-booking-token') token: string | undefined,
  ): Promise<BookingCancellationDto> {
    return this.bookings.cancel(bookingId, token);
  }
}
