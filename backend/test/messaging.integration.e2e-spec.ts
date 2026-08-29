import { execFileSync } from 'node:child_process';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { connect, type Channel, type ChannelModel, type GetMessage } from 'amqplib';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  GenericContainer,
  getContainerRuntimeClient,
  Wait,
  type StartedTestContainer,
} from 'testcontainers';

import { configureApp } from '../src/bootstrap';
import { validateEnv } from '../src/common/config/env.schema';
import { Clock } from '../src/common/time/clock';
import type { BookingEventEnvelope, BookingEventType } from '../src/messaging/event-envelope';
import { RabbitMqService } from '../src/messaging/rabbitmq.service';
import { PrismaService } from '../src/prisma/prisma.service';

const messagingDescribe = process.env.RUN_MESSAGING_TESTS === 'true' ? describe : describe.skip;
const CALENDAR_ID = '6f1c2f0e-9a1e-4d3b-9a4a-0f5b3f2a1c11';
const NOW = new Date('2026-09-01T08:00:00Z');

messagingDescribe('RabbitMQ transactional outbox integration', () => {
  jest.setTimeout(180_000);

  let postgres: StartedTestContainer;
  let rabbitContainer: StartedTestContainer;
  let rabbitConnection: ChannelModel;
  let app: INestApplication;
  let prisma: PrismaService;
  let rabbit: RabbitMqService;
  let server: App;

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'booking',
        POSTGRES_PASSWORD: 'booking',
        POSTGRES_DB: 'booking_call_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();
    rabbitContainer = await new GenericContainer('rabbitmq:3.13-alpine')
      .withExposedPorts(5672)
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
      .start();

    process.env.DATABASE_URL = `postgresql://booking:booking@${postgres.getHost()}:${postgres.getMappedPort(5432)}/booking_call_test`;
    process.env.MESSAGING_ENABLED = 'true';
    process.env.LOG_LEVEL = 'log';
    process.env.RABBITMQ_URL = `amqp://guest:guest@${rabbitContainer.getHost()}:${rabbitContainer.getMappedPort(5672)}`;
    process.env.RABBITMQ_RETRY_LIMIT = '2';
    process.env.RABBITMQ_RETRY_DELAY_MS = '100';
    process.env.RABBITMQ_RECONNECT_MIN_MS = '100';
    process.env.RABBITMQ_RECONNECT_MAX_MS = '500';
    process.env.OUTBOX_POLL_INTERVAL_MS = '100';
    process.env.OUTBOX_CLAIM_LEASE_MS = '1000';

    execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
    });
    execFileSync('./node_modules/.bin/prisma', ['db', 'seed'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
    });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({ now: () => NOW })
      .compile();
    app = configureApp(
      moduleRef.createNestApplication({ logger: ['log', 'warn', 'error'] }),
      validateEnv(process.env),
    );
    await app.init();
    prisma = app.get(PrismaService);
    rabbit = app.get(RabbitMqService);
    server = app.getHttpServer() as App;
    await eventually(() => rabbit.isReachable());
  });

  beforeEach(async () => {
    await prisma.notificationLog.deleteMany();
    await prisma.idempotencyRecord.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.slotReservation.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.availabilityWindow.deleteMany();
    await prisma.availabilityWindow.create({
      data: {
        calendarId: CALENDAR_ID,
        startsAt: new Date('2026-09-02T09:00:00Z'),
        endsAt: new Date('2026-09-02T12:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    if (rabbitConnection) await rabbitConnection.close();
    if (app) await app.close();
    if (rabbitContainer) await rabbitContainer.stop();
    if (postgres) await postgres.stop();
  });

  it('stores while broker is unavailable, recovers, handles all types and deduplicates', async () => {
    const runtime = await getContainerRuntimeClient();
    const rawRabbit = runtime.container.getById(rabbitContainer.getId());
    await rawRabbit.pause();

    let bookingId = '';
    try {
      const createdResponse = await request(server)
        .post('/api/v1/calendars/demo/bookings')
        .send({
          startsAt: '2026-09-02T09:00:00Z',
          guestName: 'Messaging Guest',
          guestEmail: 'messaging@example.com',
        })
        .expect(201);
      bookingId = (createdResponse.body as { id: string }).id;
    } finally {
      await rawRabbit.unpause();
    }
    expect(await prisma.outboxEvent.count({ where: { status: 'PENDING' } })).toBe(1);

    await eventually(() => rabbit.isReachable(), 30_000);
    await eventually(() => notificationTypes(bookingId).then((types) => types.length === 1));

    const cancelled = await createOutbox('booking.cancelled', bookingId, {
      bookingId,
      cancelledAt: new Date().toISOString(),
    });
    const rescheduled = await createOutbox('booking.rescheduled', bookingId, {
      bookingId,
      previousStartsAt: '2026-09-02T09:00:00.000Z',
      previousEndsAt: '2026-09-02T09:30:00.000Z',
      startsAt: '2026-09-02T10:00:00.000Z',
      endsAt: '2026-09-02T10:30:00.000Z',
      rescheduledAt: new Date().toISOString(),
    });
    await eventually(() => notificationTypes(bookingId).then((types) => types.length === 3));
    await eventually(() =>
      prisma.outboxEvent
        .count({ where: { id: { in: [cancelled.id, rescheduled.id] }, status: 'PUBLISHED' } })
        .then((count) => count === 2),
    );
    expect(await notificationTypes(bookingId)).toEqual([
      'booking.cancelled',
      'booking.created',
      'booking.rescheduled',
    ]);

    const original = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'booking.created' },
    });
    await publishEnvelope({
      eventId: original.id,
      eventType: 'booking.created',
      version: 1,
      occurredAt: original.createdAt.toISOString(),
      aggregateId: bookingId,
      correlationId: original.id,
      payload: original.payload,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await prisma.notificationLog.count({ where: { eventId: original.id } })).toBe(1);
  });

  it('routes a repeatedly failing valid event to DLQ after bounded retries', async () => {
    const missingBookingId = '11111111-1111-4111-8111-111111111111';
    const eventId = '22222222-2222-4222-8222-222222222222';
    await publishEnvelope({
      eventId,
      eventType: 'booking.created',
      version: 1,
      occurredAt: new Date().toISOString(),
      aggregateId: missingBookingId,
      correlationId: eventId,
      payload: { bookingId: missingBookingId },
    });

    rabbitConnection = await connect(process.env.RABBITMQ_URL as string);
    const channel = await rabbitConnection.createChannel();
    const dlqMessage = await getEventually(
      channel,
      process.env.RABBITMQ_DLQ ?? 'booking.notifications.dlq.v1',
    );
    expect(JSON.parse(dlqMessage.content.toString('utf8'))).toMatchObject({ eventId });
    expect(dlqMessage.properties.headers?.['x-retry-count']).toBe(2);
    channel.ack(dlqMessage);
    await channel.close();
    expect(await prisma.notificationLog.count({ where: { eventId } })).toBe(0);
  });

  async function createOutbox(eventType: BookingEventType, bookingId: string, payload: object) {
    return prisma.outboxEvent.create({
      data: { aggregateType: 'Booking', aggregateId: bookingId, eventType, payload },
    });
  }

  async function notificationTypes(bookingId: string): Promise<string[]> {
    const logs = await prisma.notificationLog.findMany({
      where: { bookingId },
      orderBy: { eventType: 'asc' },
      select: { eventType: true },
    });
    return logs.map((log) => log.eventType);
  }

  async function publishEnvelope(envelope: BookingEventEnvelope): Promise<void> {
    const connection = await connect(process.env.RABBITMQ_URL as string);
    const channel = await connection.createConfirmChannel();
    channel.publish(
      process.env.RABBITMQ_EXCHANGE ?? 'booking.events.v1',
      envelope.eventType,
      Buffer.from(JSON.stringify(envelope)),
      { persistent: true, contentType: 'application/json', messageId: envelope.eventId },
    );
    await channel.waitForConfirms();
    await channel.close();
    await connection.close();
  }

  async function eventually(predicate: () => boolean | Promise<boolean>, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Condition was not met within ${timeoutMs}ms`);
  }

  async function getEventually(channel: Channel, queue: string): Promise<GetMessage> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const message = await channel.get(queue, { noAck: false });
      if (message) return message;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('DLQ message was not received within 15000ms');
  }
});
