import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AvailabilityService } from './availability.service';
import type { AvailabilityWindowDto, AvailabilityWindowListDto } from './availability.types';
import { CreateAvailabilityDto } from './create-availability.dto';

@Controller('owner/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  list(): Promise<AvailabilityWindowListDto> {
    return this.availability.list();
  }

  @Post()
  async create(
    @Body() input: CreateAvailabilityDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AvailabilityWindowDto> {
    const created = await this.availability.create(input);
    response.setHeader('Location', `/api/v1/owner/availability/${created.id}`);
    return created;
  }

  @Delete(':windowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('windowId', new ParseUUIDPipe()) windowId: string): Promise<void> {
    return this.availability.delete(windowId);
  }
}
