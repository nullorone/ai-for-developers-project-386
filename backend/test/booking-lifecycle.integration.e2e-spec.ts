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
const CALENDAR_ID = '6f1c2f0e-9a1e-4d3b-9a4a-0f5b3f2a1c11';
const NOW = new Date('2026-09-01T08:00:00Z');

interface CreatedBooking {
  id: string;
  managementToken: string;
  startsAt: string;
}

databaseDescribe('PostgreSQL API: booking lifecycle and concurrency', () => {
  const prisma = new PrismaService();
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({ now: () => NOW })
      .compile();
    app = configureApp(moduleRef.createNestApplication(), validateEnv(process.env));
    await app.init();
    server = app.getHttpServer() as App;
  });

  beforeEach(async () => {
    await prisma.idempotencyRecord.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.slotReservation.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.availabilityWindow.deleteMany();
    await prisma.availabilityWindow.create({
      data: {
        calendarId: CALENDAR_ID,
        startsAt: new Date('2026-09-02T09:00:00Z'),
        endsAt: new Date('2026-09-02T15:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates once, replays encrypted result and rejects key reuse', async () => {
    const key = 'booking-attempt-0000000001';
    const first = await create('2026-09-02T09:00:00Z', key);
    const replay = await request(server)
      .post('/api/v1/calendars/demo/bookings')
      .set('Idempotency-Key', key)
      .send(bookingBody('2026-09-02T09:00:00Z'))
      .expect(201);

    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(first);
    await request(server)
      .post('/api/v1/calendars/demo/bookings')
      .set('Idempotency-Key', key)
      .send(bookingBody('2026-09-02T09:30:00Z'))
      .expect(409)
      .expect(({ body }) => expect(body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' }));

    expect(await prisma.booking.count()).toBe(1);
    expect(await prisma.slotReservation.count()).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'booking.created' } })).toBe(1);
    const stored = await prisma.idempotencyRecord.findFirstOrThrow();
    expect(stored.responseCiphertext).not.toContain(first.managementToken);
    expect(JSON.stringify(stored)).not.toContain(key);
  });

  it('returns a minimal cancellation view and cancels idempotently', async () => {
    const created = await create('2026-09-02T09:00:00Z');
    const view = await request(server)
      .get(`/api/v1/bookings/${created.id}/cancellation`)
      .set('X-Booking-Token', created.managementToken)
      .expect(200);
    expect(view.body).toMatchObject({ id: created.id, status: 'CONFIRMED', cancellable: true });
    expect(view.body).not.toHaveProperty('guestName');
    expect(view.body).not.toHaveProperty('guestEmail');
    await request(server)
      .get(`/api/v1/bookings/${created.id}/cancellation`)
      .set('X-Booking-Token', 'wrong_management_token_12345')
      .expect(403)
      .expect(({ body }) => expect(body).toMatchObject({ code: 'BOOKING_TOKEN_INVALID' }));

    const cancelled = await cancel(created);
    const repeated = await cancel(created);
    expect(repeated).toEqual(cancelled);
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellable: false });
    expect(await prisma.slotReservation.count()).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'booking.cancelled' } })).toBe(1);

    await create('2026-09-02T09:00:00Z');
    expect(
      await prisma.slotReservation.count({ where: { startsAt: new Date(created.startsAt) } }),
    ).toBe(1);
  });

  it('reschedules atomically and keeps the old slot after target conflict', async () => {
    const moving = await create('2026-09-02T09:00:00Z');
    await create('2026-09-02T10:00:00Z');
    await request(server)
      .patch(`/api/v1/owner/bookings/${moving.id}/schedule`)
      .send({ startsAt: '2026-09-02T10:00:00Z' })
      .expect(409)
      .expect(({ body }) => expect(body).toMatchObject({ code: 'SLOT_TAKEN' }));
    expect(await activeStarts(moving.id)).toEqual(['2026-09-02T09:00:00.000Z']);

    const moved = await request(server)
      .patch(`/api/v1/owner/bookings/${moving.id}/schedule`)
      .send({ startsAt: '2026-09-02T11:00:00Z' })
      .expect(200);
    expect(moved.body).toMatchObject({ id: moving.id, startsAt: '2026-09-02T11:00:00Z' });
    expect(await activeStarts(moving.id)).toEqual(['2026-09-02T11:00:00.000Z']);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'booking.rescheduled' } })).toBe(1);

    await request(server)
      .patch(`/api/v1/owner/bookings/${moving.id}/schedule`)
      .send({ startsAt: '2026-09-02T11:00:00Z' })
      .expect(200);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'booking.rescheduled' } })).toBe(1);
  });

  it('allows only one of concurrent creates for the same slot', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(server)
          .post('/api/v1/calendars/demo/bookings')
          .send({
            ...bookingBody('2026-09-02T12:00:00Z'),
            guestEmail: `guest${index}@example.com`,
          }),
      ),
    );
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(7);
    expect(await prisma.slotReservation.count({ where: { status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.booking.count()).toBe(1);
    expect(await prisma.outboxEvent.count()).toBe(1);
  });

  it('allows only one of two bookings to reschedule into a shared target', async () => {
    const first = await create('2026-09-02T09:00:00Z');
    const second = await create('2026-09-02T09:30:00Z');
    const responses = await Promise.all(
      [first, second].map((booking) =>
        request(server)
          .patch(`/api/v1/owner/bookings/${booking.id}/schedule`)
          .send({ startsAt: '2026-09-02T13:00:00Z' }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const active = await prisma.slotReservation.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { startsAt: 'asc' },
      select: { startsAt: true },
    });
    expect(active).toHaveLength(2);
    expect(
      active.filter((item) => item.startsAt.toISOString() === '2026-09-02T13:00:00.000Z'),
    ).toHaveLength(1);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'booking.rescheduled' } })).toBe(1);
  });

  it('keeps invariants when create races with reschedule', async () => {
    const moving = await create('2026-09-02T09:00:00Z');
    const [created, rescheduled] = await Promise.all([
      request(server)
        .post('/api/v1/calendars/demo/bookings')
        .send(bookingBody('2026-09-02T14:00:00Z')),
      request(server)
        .patch(`/api/v1/owner/bookings/${moving.id}/schedule`)
        .send({ startsAt: '2026-09-02T14:00:00Z' }),
    ]);
    expect([created.status, rescheduled.status].sort()).toEqual([201, 409]);
    expect(
      await prisma.slotReservation.count({
        where: { status: 'ACTIVE', startsAt: new Date('2026-09-02T14:00:00Z') },
      }),
    ).toBe(1);
    expect(await prisma.slotReservation.count({ where: { status: 'ACTIVE' } })).toBe(
      await prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    );
  });

  it('rolls back booking and reservation when outbox insertion fails', async () => {
    const moving = await create('2026-09-02T09:00:00Z');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_reschedule_outbox() RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'booking.rescheduled' THEN RAISE EXCEPTION 'forced outbox failure'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_reschedule_outbox_trigger BEFORE INSERT ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION fail_reschedule_outbox()
    `);
    try {
      await request(server)
        .patch(`/api/v1/owner/bookings/${moving.id}/schedule`)
        .send({ startsAt: '2026-09-02T10:00:00Z' })
        .expect(500);
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: moving.id } });
      expect(booking.startsAt.toISOString()).toBe('2026-09-02T09:00:00.000Z');
      expect(booking.rescheduledAt).toBeNull();
      expect(await activeStarts(moving.id)).toEqual(['2026-09-02T09:00:00.000Z']);
      expect(await prisma.outboxEvent.count({ where: { eventType: 'booking.rescheduled' } })).toBe(
        0,
      );
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS fail_reschedule_outbox_trigger ON outbox_events',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_reschedule_outbox()');
    }
  });

  it('rolls back create and cancellation when their outbox insertion fails', async () => {
    await installFailingOutboxTrigger('booking.created');
    try {
      await request(server)
        .post('/api/v1/calendars/demo/bookings')
        .send(bookingBody('2026-09-02T10:00:00Z'))
        .expect(500);
      expect(await prisma.booking.count()).toBe(0);
      expect(await prisma.slotReservation.count()).toBe(0);
      expect(await prisma.outboxEvent.count()).toBe(0);
    } finally {
      await removeFailingOutboxTrigger();
    }

    const created = await create('2026-09-02T10:00:00Z');
    await installFailingOutboxTrigger('booking.cancelled');
    try {
      await request(server)
        .post(`/api/v1/bookings/${created.id}/cancellation`)
        .set('X-Booking-Token', created.managementToken)
        .expect(500);
      expect(await prisma.booking.findUnique({ where: { id: created.id } })).toMatchObject({
        status: 'CONFIRMED',
        cancelledAt: null,
      });
      expect(await activeStarts(created.id)).toEqual(['2026-09-02T10:00:00.000Z']);
      expect(await prisma.outboxEvent.count({ where: { eventType: 'booking.cancelled' } })).toBe(0);
    } finally {
      await removeFailingOutboxTrigger();
    }
  });

  async function create(startsAt: string, key?: string): Promise<CreatedBooking> {
    let pending = request(server).post('/api/v1/calendars/demo/bookings');
    if (key) pending = pending.set('Idempotency-Key', key);
    const response = await pending.send(bookingBody(startsAt)).expect(201);
    return response.body as CreatedBooking;
  }

  async function cancel(booking: CreatedBooking): Promise<Record<string, unknown>> {
    const response = await request(server)
      .post(`/api/v1/bookings/${booking.id}/cancellation`)
      .set('X-Booking-Token', booking.managementToken)
      .expect(200);
    return response.body as Record<string, unknown>;
  }

  function bookingBody(startsAt: string) {
    return { startsAt, guestName: 'Integration Guest', guestEmail: 'guest@example.com' };
  }

  async function activeStarts(bookingId: string): Promise<string[]> {
    const reservations = await prisma.slotReservation.findMany({
      where: { bookingId, status: 'ACTIVE' },
      select: { startsAt: true },
    });
    return reservations.map((item) => item.startsAt.toISOString()).sort();
  }

  async function installFailingOutboxTrigger(eventType: string): Promise<void> {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_selected_outbox() RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = '${eventType}' THEN RAISE EXCEPTION 'forced outbox failure'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_selected_outbox_trigger BEFORE INSERT ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION fail_selected_outbox()
    `);
  }

  async function removeFailingOutboxTrigger(): Promise<void> {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS fail_selected_outbox_trigger ON outbox_events',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_selected_outbox()');
  }
});
