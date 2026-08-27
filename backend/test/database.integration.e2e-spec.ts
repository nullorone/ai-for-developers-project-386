import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { AvailabilityRepository } from '../src/availability/availability.repository';
import { configureApp } from '../src/bootstrap';
import { validateEnv } from '../src/common/config/env.schema';
import { Clock } from '../src/common/time/clock';
import { PrismaService } from '../src/prisma/prisma.service';
import { SlotGeneratorService } from '../src/slots/slot-generator.service';
import { SlotsRepository } from '../src/slots/slots.repository';

const databaseDescribe = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;
const DEMO_CALENDAR_ID = '6f1c2f0e-9a1e-4d3b-9a4a-0f5b3f2a1c11';
const date = (value: string): Date => new Date(value);

databaseDescribe('PostgreSQL integration: availability and slot queries', () => {
  const prisma = new PrismaService();
  const availability = new AvailabilityRepository(prisma);
  const slots = new SlotsRepository(prisma);
  let app: INestApplication;

  beforeAll(async () => {
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({ now: () => date('2026-09-01T08:00:00Z') })
      .compile();
    app = configureApp(moduleRef.createNestApplication(), validateEnv(process.env));
    await app.init();
  });
  beforeEach(async () => {
    await prisma.slotReservation.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.availabilityWindow.deleteMany();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('read endpoints и owner availability CRUD соответствуют контрактным DTO', async () => {
    const server = app.getHttpServer() as App;
    const calendar = await request(server).get('/api/v1/calendars/demo').expect(200);
    expect(calendar.body).toMatchObject({
      id: DEMO_CALENDAR_ID,
      slug: 'demo',
      slotDurationMinutes: 30,
      minimumLeadTimeMinutes: 60,
      bookingHorizonDays: 90,
    });

    const created = await request(server)
      .post('/api/v1/owner/availability')
      .send({
        startsAt: '2026-09-01T09:00:00Z',
        endsAt: '2026-09-01T11:00:00Z',
      })
      .expect(201);
    const createdBody = created.body as { id: string };
    expect(created.headers.location).toBe(`/api/v1/owner/availability/${createdBody.id}`);
    await request(server)
      .post('/api/v1/owner/availability')
      .send({
        startsAt: '2026-09-01T10:30:00Z',
        endsAt: '2026-09-01T11:30:00Z',
      })
      .expect(409)
      .expect(({ body }) => expect(body).toMatchObject({ code: 'AVAILABILITY_OVERLAP' }));

    const list = await request(server).get('/api/v1/owner/availability').expect(200);
    expect(list.body).toMatchObject({ calendarId: DEMO_CALENDAR_ID, total: 1, maxWindows: 500 });
    const publicSlots = await request(server)
      .get('/api/v1/calendars/demo/slots')
      .query({
        from: '2026-09-01T08:00:00Z',
        to: '2026-09-02T08:00:00Z',
      })
      .expect(200);
    const slotsBody = publicSlots.body as { slots: Array<{ startsAt: string; endsAt: string }> };
    expect(slotsBody.slots).toHaveLength(4);
    expect(slotsBody.slots[0]).toEqual({
      startsAt: '2026-09-01T09:00:00Z',
      endsAt: '2026-09-01T09:30:00Z',
    });
    await request(server)
      .get('/api/v1/owner/bookings')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ calendarId: DEMO_CALENDAR_ID, total: 0, items: [] }),
      );
    await request(server).delete(`/api/v1/owner/availability/${createdBody.id}`).expect(204);
  });

  it('принимает смежные окна и предсказуемо отвергает пересечение', async () => {
    expect(
      (
        await availability.createAtomic(
          DEMO_CALENDAR_ID,
          date('2026-09-01T09:00:00Z'),
          date('2026-09-01T10:00:00Z'),
          500,
        )
      ).kind,
    ).toBe('created');
    expect(
      (
        await availability.createAtomic(
          DEMO_CALENDAR_ID,
          date('2026-09-01T10:00:00Z'),
          date('2026-09-01T11:00:00Z'),
          500,
        )
      ).kind,
    ).toBe('created');
    expect(
      (
        await availability.createAtomic(
          DEMO_CALENDAR_ID,
          date('2026-09-01T09:30:00Z'),
          date('2026-09-01T10:30:00Z'),
          500,
        )
      ).kind,
    ).toBe('overlap');
    await expect(
      prisma.availabilityWindow.create({
        data: {
          calendarId: DEMO_CALENDAR_ID,
          startsAt: date('2026-09-01T09:30:00Z'),
          endsAt: date('2026-09-01T10:30:00Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('запрос входных данных слотов возвращает окна и только активные reservations', async () => {
    await prisma.availabilityWindow.create({
      data: {
        calendarId: DEMO_CALENDAR_ID,
        startsAt: date('2026-09-02T09:00:00Z'),
        endsAt: date('2026-09-02T11:00:00Z'),
      },
    });
    const first = await prisma.booking.create({
      data: {
        calendarId: DEMO_CALENDAR_ID,
        startsAt: date('2026-09-02T09:30:00Z'),
        endsAt: date('2026-09-02T10:00:00Z'),
        guestName: 'Integration Guest',
        guestEmail: 'guest@example.com',
        managementTokenHash: 'a'.repeat(64),
      },
    });
    const second = await prisma.booking.create({
      data: {
        calendarId: DEMO_CALENDAR_ID,
        startsAt: date('2026-09-02T10:00:00Z'),
        endsAt: date('2026-09-02T10:30:00Z'),
        guestName: 'Released Guest',
        guestEmail: 'released@example.com',
        managementTokenHash: 'b'.repeat(64),
      },
    });
    await prisma.slotReservation.createMany({
      data: [
        {
          calendarId: DEMO_CALENDAR_ID,
          bookingId: first.id,
          startsAt: first.startsAt,
          status: 'ACTIVE',
        },
        {
          calendarId: DEMO_CALENDAR_ID,
          bookingId: second.id,
          startsAt: second.startsAt,
          status: 'RELEASED',
          releasedAt: date('2026-09-01T00:00:00Z'),
        },
      ],
    });

    const inputs = await slots.queryInputs(
      DEMO_CALENDAR_ID,
      date('2026-09-02T09:00:00Z'),
      date('2026-09-02T11:00:00Z'),
    );
    expect(inputs.availability).toHaveLength(1);
    expect(inputs.activeReservationStarts).toEqual([date('2026-09-02T09:30:00Z')]);
    const generated = new SlotGeneratorService().generate({
      range: { startsAt: date('2026-09-02T09:00:00Z'), endsAt: date('2026-09-02T11:00:00Z') },
      availability: inputs.availability,
      activeReservationStarts: inputs.activeReservationStarts,
      earliestStart: date('2026-09-01T00:00:00Z'),
    });
    expect(generated.map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-09-02T09:00:00.000Z',
      '2026-09-02T10:00:00.000Z',
      '2026-09-02T10:30:00.000Z',
    ]);
  });

  it('планировщик может использовать индексы основных range/slot запросов', async () => {
    await prisma.$executeRaw`SET LOCAL enable_seqscan = off`;
    const windowPlan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN SELECT starts_at, ends_at FROM availability_windows
      WHERE calendar_id = ${DEMO_CALENDAR_ID}::uuid
        AND starts_at < ${date('2026-09-10T00:00:00Z')} AND ends_at > ${date('2026-09-01T00:00:00Z')}
      ORDER BY starts_at`;
    const reservationPlan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN SELECT starts_at FROM slot_reservations
      WHERE calendar_id = ${DEMO_CALENDAR_ID}::uuid AND status = 'ACTIVE'
        AND starts_at >= ${date('2026-09-01T00:00:00Z')} AND starts_at < ${date('2026-09-10T00:00:00Z')}`;
    expect(windowPlan.map((row) => row['QUERY PLAN']).join('\n')).toMatch(
      /availability_calendar_range_idx|availability_no_overlap/,
    );
    expect(reservationPlan.map((row) => row['QUERY PLAN']).join('\n')).toMatch(
      /reservation_slot_query_idx|reservation_one_active_slot/,
    );
  });
});
