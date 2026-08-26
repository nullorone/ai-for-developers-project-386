import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { HealthStatus } from '../common/contract';
import { HealthService } from './health.service';

/**
 * Служебные пробы контракта: `GET /health`, `/health/live`, `/health/ready`.
 *
 * Тело ответа — схема `HealthStatus`; при неготовности возвращается `503`
 * с тем же телом (а не с `Error`), поэтому статус выставляется вручную,
 * минуя глобальный фильтр ошибок.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async getHealth(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    return this.respond(res, await this.health.overall());
  }

  @Get('live')
  getLiveness(): HealthStatus {
    return this.health.live();
  }

  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    return this.respond(res, await this.health.ready());
  }

  private respond(res: Response, status: HealthStatus): HealthStatus {
    res.status(status.status === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return status;
  }
}
