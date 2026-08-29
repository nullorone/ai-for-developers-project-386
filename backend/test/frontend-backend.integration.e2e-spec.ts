import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { validateEnv } from '../src/common/config/env.schema';
import { Clock } from '../src/common/time/clock';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseDescribe = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;
const NOW = new Date('2026-09-01T08:00:00Z');

interface CreatedBooking {
  id: string;
  managementToken: string;
  startsAt: string;
}

databaseDescribe('Frontend ↔ real API smoke', () => {
  const prisma = new PrismaService();
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({ now: () => NOW })
      .compile();
    app = configureApp(
      moduleRef.createNestApplication(),
      validateEnv({
        ...process.env,
        CORS_ORIGINS: 'http://localhost:5173,http://localhost:4173,https://nullorone.github.io',
      }),
    );
    await app.init();
    server = app.getHttpServer() as App;
  });

  beforeEach(async () => {
    await prisma.idempotencyRecord.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.slotReservation.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.availabilityWindow.deleteMany();
    await publishAvailability();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('completes guest slots → booking → protected cancellation → released slot', async () => {
    const initialSlots = await listPublicSlots();
    expect(initialSlots).toContain('2026-09-02T09:00:00Z');

    const created = await createBooking('2026-09-02T09:00:00Z', 'frontend-guest-attempt-0001');
    expect(await listPublicSlots()).not.toContain(created.startsAt);

    await request(server)
      .get(`/api/v1/bookings/${created.id}/cancellation`)
      .set('X-Booking-Token', created.managementToken)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'CONFIRMED', cancellable: true }));
    await request(server)
      .post(`/api/v1/bookings/${created.id}/cancellation`)
      .set('X-Booking-Token', created.managementToken)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: 'CANCELLED', cancellable: false }),
      );

    expect(await listPublicSlots()).toContain(created.startsAt);
  });

  it('completes owner booking list → available slots → reschedule flow', async () => {
    const created = await createBooking('2026-09-02T09:00:00Z', 'frontend-owner-attempt-0001');
    await request(server)
      .get('/api/v1/owner/bookings')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          total: 1,
          items: [{ id: created.id, startsAt: created.startsAt }],
        }),
      );

    const available = await request(server)
      .get(`/api/v1/owner/bookings/${created.id}/available-slots`)
      .expect(200);
    const availableBody = available.body as {
      slots: Array<{ startsAt: string; current: boolean }>;
    };
    expect(availableBody.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ startsAt: created.startsAt, current: true }),
        expect.objectContaining({ startsAt: '2026-09-02T10:00:00Z', current: false }),
      ]),
    );

    await request(server)
      .patch(`/api/v1/owner/bookings/${created.id}/schedule`)
      .send({ startsAt: '2026-09-02T10:00:00Z' })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ id: created.id, startsAt: '2026-09-02T10:00:00Z' }),
      );
    expect(await listPublicSlots()).toEqual(expect.arrayContaining(['2026-09-02T09:00:00Z']));
    expect(await listPublicSlots()).not.toContain('2026-09-02T10:00:00Z');
  });

  it('allows the configured future GitHub Pages origin without credentials', async () => {
    const origin = 'https://nullorone.github.io';
    const response = await request(server)
      .options('/api/v1/calendars/demo')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  async function publishAvailability(): Promise<void> {
    await request(server)
      .post('/api/v1/owner/availability')
      .send({ startsAt: '2026-09-02T09:00:00Z', endsAt: '2026-09-02T12:00:00Z' })
      .expect(201);
  }

  async function listPublicSlots(): Promise<string[]> {
    const response = await request(server)
      .get('/api/v1/calendars/demo/slots')
      .query({ from: '2026-09-02T00:00:00Z', to: '2026-09-03T00:00:00Z' })
      .expect(200);
    const body = response.body as { slots: Array<{ startsAt: string }> };
    return body.slots.map((slot) => slot.startsAt);
  }

  async function createBooking(startsAt: string, idempotencyKey: string): Promise<CreatedBooking> {
    const response = await request(server)
      .post('/api/v1/calendars/demo/bookings')
      .set('Idempotency-Key', idempotencyKey)
      .send({ startsAt, guestName: 'Integration Guest', guestEmail: 'guest@example.com' })
      .expect(201);
    return response.body as CreatedBooking;
  }
});
