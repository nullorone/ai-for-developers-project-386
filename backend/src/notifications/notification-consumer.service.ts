import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

import type { Env } from '../common/config/env.schema';
import { parseEnvelope, type BookingEventEnvelope } from '../messaging/event-envelope';
import { MessagingMetricsService } from '../messaging/messaging-metrics.service';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';

class PermanentMessageError extends Error {}

@Injectable()
export class NotificationConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumerService.name);
  private readonly setup = (connection: ChannelModel): Promise<void> => this.start(connection);
  private channel: Channel | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly metrics: MessagingMetricsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    if (this.rabbit.enabled) this.rabbit.registerSetup(this.setup);
  }

  async onModuleDestroy(): Promise<void> {
    this.rabbit.unregisterSetup(this.setup);
    const channel = this.channel;
    this.channel = null;
    if (channel) {
      try {
        await channel.close();
      } catch {
        // The parent connection may already be closed.
      }
    }
  }

  private async start(connection: ChannelModel): Promise<void> {
    const channel = await connection.createChannel();
    await channel.prefetch(this.config.get('RABBITMQ_PREFETCH', { infer: true }));
    await channel.consume(
      this.config.get('RABBITMQ_QUEUE', { infer: true }),
      (message) => {
        if (message) void this.handle(channel, message);
      },
      { noAck: false },
    );
    this.channel = channel;
    this.logger.log(JSON.stringify({ event: 'notification_consumer_started' }));
  }

  private async handle(channel: Channel, message: ConsumeMessage): Promise<void> {
    let envelope: BookingEventEnvelope | null = null;
    try {
      envelope = parseEnvelope(JSON.parse(message.content.toString('utf8')) as unknown);
      const duplicate = await this.process(envelope);
      if (duplicate) {
        this.metrics.increment('consumer_duplicates', {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
        });
      }
      channel.ack(message);
    } catch (error) {
      await this.retryOrDeadLetter(channel, message, envelope, error);
    }
  }

  /** Returns true when the unique database event id has already been processed. */
  private async process(event: BookingEventEnvelope): Promise<boolean> {
    const payload = event.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new PermanentMessageError('payload must be an object');
    }
    const bookingId = (payload as Record<string, Prisma.JsonValue>).bookingId;
    if (typeof bookingId !== 'string' || bookingId !== event.aggregateId) {
      throw new PermanentMessageError('payload bookingId must match aggregateId');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          select: { guestEmail: true },
        });
        if (!booking) throw new Error('booking is temporarily unavailable');
        await tx.notificationLog.create({
          data: {
            eventId: event.eventId,
            eventType: event.eventType,
            bookingId,
            recipient: booking.guestEmail,
            status: 'SENT',
            attempts: 1,
            processedAt: new Date(),
          },
        });
      });
      this.logger.log(
        JSON.stringify({
          event: 'notification_processed',
          eventId: event.eventId,
          eventType: event.eventType,
        }),
      );
      return false;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return true;
      }
      throw error;
    }
  }

  private async retryOrDeadLetter(
    channel: Channel,
    message: ConsumeMessage,
    envelope: BookingEventEnvelope | null,
    error: unknown,
  ): Promise<void> {
    const current = this.retryCount(message);
    const limit = this.config.get('RABBITMQ_RETRY_LIMIT', { infer: true });
    const permanent = error instanceof PermanentMessageError || envelope === null;
    const eventType = (envelope?.eventType ?? message.fields.routingKey) || 'invalid';
    const properties = message.properties as unknown as {
      contentType?: unknown;
      messageId?: unknown;
      correlationId?: unknown;
      headers?: unknown;
    };
    const contentType = this.stringProperty(properties.contentType) ?? 'application/json';
    const messageId = envelope?.eventId ?? this.stringProperty(properties.messageId);
    const correlationId = envelope?.correlationId ?? this.stringProperty(properties.correlationId);
    const headers = this.objectProperty(properties.headers);
    try {
      if (!permanent && current < limit) {
        await this.rabbit.publish(
          this.config.get('RABBITMQ_RETRY_EXCHANGE', { infer: true }),
          eventType,
          message.content,
          {
            persistent: true,
            contentType,
            messageId,
            correlationId,
            headers: { ...headers, 'x-retry-count': current + 1 },
          },
        );
        this.metrics.increment('consumer_retries', {
          eventId: envelope?.eventId,
          eventType,
          retry: current + 1,
        });
      } else {
        await this.rabbit.publish(
          this.config.get('RABBITMQ_DLQ_EXCHANGE', { infer: true }),
          eventType,
          message.content,
          {
            persistent: true,
            contentType,
            messageId,
            correlationId,
            headers: {
              ...headers,
              'x-retry-count': current,
              'x-failure-reason': this.safeError(error),
            },
          },
        );
        this.metrics.increment('consumer_dlq', {
          eventId: envelope?.eventId,
          eventType,
          retries: current,
        });
      }
      // The replacement message is publisher-confirmed before the original is acknowledged.
      channel.ack(message);
    } catch (publishError) {
      this.logger.warn(
        JSON.stringify({ event: 'consumer_republish_failed', error: this.safeError(publishError) }),
      );
      channel.nack(message, false, true);
    }
  }

  private retryCount(message: ConsumeMessage): number {
    const properties = message.properties as unknown as { headers?: unknown };
    const value = this.objectProperty(properties.headers)['x-retry-count'];
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
  }

  private stringProperty(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private objectProperty(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private safeError(error: unknown): string {
    return (error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown consumer error')
      .replace(/amqps?:\/\/[^\s]+/gi, '[AMQP_URL]')
      .slice(0, 500);
  }
}
