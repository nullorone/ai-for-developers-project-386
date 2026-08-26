import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe('HealthService', () => {
  const isReachable = jest.fn<Promise<boolean>, []>();

  async function createService(): Promise<HealthService> {
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: { isReachable } }],
    }).compile();

    return moduleRef.get(HealthService);
  }

  it('проба живости не зависит от базы и не содержит проверок', async () => {
    isReachable.mockRejectedValue(new Error('база не должна опрашиваться'));

    expect(await createService().then((service) => service.live())).toEqual({
      status: 'up',
      checks: [],
      timestamp: expect.stringMatching(UTC_TIMESTAMP_PATTERN) as string,
    });
  });

  it('готовность равна up, когда база доступна', async () => {
    isReachable.mockResolvedValue(true);
    const service = await createService();

    await expect(service.ready()).resolves.toMatchObject({
      status: 'up',
      checks: [{ name: 'database', status: 'up' }],
    });
  });

  it('готовность равна down, когда база недоступна (правило N-18)', async () => {
    isReachable.mockResolvedValue(false);
    const service = await createService();

    await expect(service.overall()).resolves.toMatchObject({
      status: 'down',
      checks: [{ name: 'database', status: 'down' }],
    });
  });
});
