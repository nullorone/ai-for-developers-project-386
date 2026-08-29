import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type OutboxEvent } from '@prisma/client';

import type { Env } from '../common/config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { isBookingEventType, type BookingEventEnvelope } from './event-envelope';
import { MessagingMetricsService } from './messaging-metrics.service';
import { RabbitMqService } from './rabbitmq.service';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly metrics: MessagingMetricsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    if (!this.rabbit.enabled) return;
    const interval = this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true });
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /** Public for deterministic integration tests and operational recovery hooks. */
  async publishPendingBatch(): Promise<number> {
    const events = await this.claimBatch();
    for (const event of events) await this.publishOne(event);
    return events.length;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const backlog = await this.prisma.outboxEvent.count({ where: { status: 'PENDING' } });
      this.metrics.backlog(backlog);
      if (this.rabbit.isReachable()) await this.publishPendingBatch();
    } catch (error) {
      this.logger.warn(
        JSON.stringify({ event: 'outbox_tick_failed', error: this.safeError(error) }),
      );
    } finally {
      this.running = false;
    }
  }

  private claimBatch(): Promise<OutboxEvent[]> {
    const batch = this.config.get('OUTBOX_BATCH_SIZE', { infer: true });
    const lease = this.config.get('OUTBOX_CLAIM_LEASE_MS', { infer: true });
    return this.prisma.$queryRaw<OutboxEvent[]>(Prisma.sql`
      WITH candidates AS (
        SELECT id FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= CURRENT_TIMESTAMP
        ORDER BY created_at, id
        LIMIT ${batch}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events AS event
      SET attempts = event.attempts + 1,
          available_at = CURRENT_TIMESTAMP + (${lease} * INTERVAL '1 millisecond')
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id,
                event.aggregate_type AS "aggregateType",
                event.aggregate_id AS "aggregateId",
                event.event_type AS "eventType",
                event.payload,
                event.status,
                event.attempts,
                event.available_at AS "availableAt",
                event.published_at AS "publishedAt",
                event.last_error AS "lastError",
                event.created_at AS "createdAt"
    `);
  }

  private async publishOne(event: OutboxEvent): Promise<void> {
    if (!isBookingEventType(event.eventType)) {
      await this.fail(event, new Error(`Unsupported event type: ${event.eventType}`));
      return;
    }
    const envelope: BookingEventEnvelope = {
      eventId: event.id,
      eventType: event.eventType,
      version: 1,
      occurredAt: event.createdAt.toISOString(),
      aggregateId: event.aggregateId,
      correlationId: event.id,
      payload: event.payload,
    };
    try {
      await this.rabbit.publish(
        this.config.get('RABBITMQ_EXCHANGE', { infer: true }),
        event.eventType,
        Buffer.from(JSON.stringify(envelope)),
        {
          persistent: true,
          contentType: 'application/json',
          contentEncoding: 'utf-8',
          messageId: event.id,
          correlationId: envelope.correlationId,
          timestamp: event.createdAt.getTime(),
          type: event.eventType,
        },
      );
      await this.prisma.outboxEvent.updateMany({
        where: { id: event.id, status: 'PENDING' },
        data: { status: 'PUBLISHED', publishedAt: new Date(), lastError: null },
      });
      this.logger.log(
        JSON.stringify({
          event: 'outbox_published',
          eventId: event.id,
          eventType: event.eventType,
        }),
      );
    } catch (error) {
      await this.fail(event, error);
    }
  }

  private async fail(event: OutboxEvent, error: unknown): Promise<void> {
    const delay = Math.min(60_000, 500 * 2 ** Math.min(event.attempts, 7));
    const message = this.safeError(error);
    await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { availableAt: new Date(Date.now() + delay), lastError: message },
    });
    this.metrics.increment('outbox_publish_failures', {
      eventId: event.id,
      eventType: event.eventType,
      attempts: event.attempts,
    });
    this.logger.warn(
      JSON.stringify({ event: 'outbox_publish_failed', eventId: event.id, error: message }),
    );
  }

  private safeError(error: unknown): string {
    return (error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown publish error')
      .replace(/amqps?:\/\/[^\s]+/gi, '[AMQP_URL]')
      .slice(0, 500);
  }
}
