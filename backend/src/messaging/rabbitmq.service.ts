import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type ConfirmChannel, type Options } from 'amqplib';

import type { Env } from '../common/config/env.schema';

type SetupHandler = (connection: ChannelModel) => Promise<void>;

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private readonly setups = new Set<SetupHandler>();
  private connection: ChannelModel | null = null;
  private publisher: ConfirmChannel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopping = false;
  private connecting = false;
  private ready = false;
  private lastError = '';

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('RabbitMQ lifecycle disabled');
      return;
    }
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const connection = this.connection;
    this.connection = null;
    this.publisher = null;
    this.ready = false;
    if (connection) {
      try {
        await connection.close();
      } catch {
        // Connection may already be closed by the broker.
      }
    }
    this.logger.log('RabbitMQ connection closed');
  }

  get enabled(): boolean {
    return this.config.get('MESSAGING_ENABLED', { infer: true });
  }

  isReachable(): boolean {
    return !this.enabled || this.ready;
  }

  diagnostics(): Readonly<Record<string, boolean | number | string>> {
    return {
      enabled: this.enabled,
      ready: this.ready,
      connecting: this.connecting,
      reconnectScheduled: this.reconnectTimer !== null,
      reconnectAttempt: this.reconnectAttempt,
      hasConnection: this.connection !== null,
      hasPublisher: this.publisher !== null,
      lastError: this.lastError,
    };
  }

  registerSetup(handler: SetupHandler): void {
    this.setups.add(handler);
    if (this.connection && this.ready) {
      const connection = this.connection;
      void this.runSetup(handler, connection).catch((error: unknown) =>
        this.handleSetupFailure(error, connection),
      );
    }
  }

  unregisterSetup(handler: SetupHandler): void {
    this.setups.delete(handler);
  }

  async publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Options.Publish,
  ): Promise<void> {
    const channel = this.publisher;
    if (!channel || !this.ready) throw new Error('RabbitMQ is unavailable');
    const timeoutMs = this.config.get('RABBITMQ_CONFIRM_TIMEOUT_MS', { infer: true });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('RabbitMQ publisher confirm timed out')),
        timeoutMs,
      );
      channel.publish(exchange, routingKey, content, options, (error) => {
        clearTimeout(timer);
        if (error) reject(error instanceof Error ? error : new Error('RabbitMQ publish nacked'));
        else resolve();
      });
    });
  }

  private async connect(): Promise<void> {
    if (this.stopping || this.connecting || this.connection) return;
    this.connecting = true;
    try {
      const connection = await connect(this.config.get('RABBITMQ_URL', { infer: true }));
      connection.on('error', (error: Error) => {
        this.logger.warn(JSON.stringify({ event: 'rabbitmq_error', error: this.safeError(error) }));
      });
      connection.on('close', () => this.disconnected(connection));
      this.connection = connection;
      const publisher = await connection.createConfirmChannel();
      await this.assertTopology(publisher);
      this.publisher = publisher;
      await this.runRegisteredSetups(connection);
      this.reconnectAttempt = 0;
      this.ready = true;
      this.lastError = '';
      this.logger.log(JSON.stringify({ event: 'rabbitmq_connected' }));
    } catch (error) {
      this.lastError = this.safeError(error);
      this.ready = false;
      const failedConnection = this.connection;
      this.connection = null;
      this.publisher = null;
      this.logger.warn(JSON.stringify({ event: 'rabbitmq_connect_failed', error: this.lastError }));
      if (failedConnection) {
        try {
          await failedConnection.close();
        } catch {
          // The setup failure may already have closed the connection.
        }
      }
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private disconnected(connection: ChannelModel): void {
    if (this.connection === connection) {
      this.connection = null;
      this.publisher = null;
      this.ready = false;
    }
    if (!this.stopping) {
      this.logger.warn(JSON.stringify({ event: 'rabbitmq_disconnected' }));
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    const minimum = this.config.get('RABBITMQ_RECONNECT_MIN_MS', { infer: true });
    const maximum = this.config.get('RABBITMQ_RECONNECT_MAX_MS', { infer: true });
    const delay = Math.min(maximum, minimum * 2 ** Math.min(this.reconnectAttempt++, 10));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.connecting) {
        this.scheduleReconnect();
        return;
      }
      void this.connect();
    }, delay);
  }

  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    const exchange = this.config.get('RABBITMQ_EXCHANGE', { infer: true });
    const queue = this.config.get('RABBITMQ_QUEUE', { infer: true });
    const retryExchange = this.config.get('RABBITMQ_RETRY_EXCHANGE', { infer: true });
    const retryQueue = this.config.get('RABBITMQ_RETRY_QUEUE', { infer: true });
    const dlx = this.config.get('RABBITMQ_DLQ_EXCHANGE', { infer: true });
    const dlq = this.config.get('RABBITMQ_DLQ', { infer: true });
    await channel.assertExchange(exchange, 'topic', { durable: true });
    await channel.assertExchange(retryExchange, 'topic', { durable: true });
    await channel.assertExchange(dlx, 'topic', { durable: true });
    await channel.assertQueue(queue, { durable: true, deadLetterExchange: dlx });
    await channel.bindQueue(queue, exchange, 'booking.*');
    await channel.assertQueue(retryQueue, {
      durable: true,
      messageTtl: this.config.get('RABBITMQ_RETRY_DELAY_MS', { infer: true }),
      deadLetterExchange: exchange,
    });
    await channel.bindQueue(retryQueue, retryExchange, 'booking.*');
    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, dlx, '#');
  }

  private async runSetup(handler: SetupHandler, connection: ChannelModel): Promise<void> {
    await handler(connection);
  }

  private async runRegisteredSetups(connection: ChannelModel): Promise<void> {
    const completed = new Set<SetupHandler>();
    while (true) {
      const pending = [...this.setups].filter((handler) => !completed.has(handler));
      if (pending.length === 0) return;
      await Promise.all(pending.map((handler) => this.runSetup(handler, connection)));
      pending.forEach((handler) => completed.add(handler));
    }
  }

  private async handleSetupFailure(error: unknown, connection: ChannelModel): Promise<void> {
    this.logger.error(
      JSON.stringify({ event: 'rabbitmq_setup_failed', error: this.safeError(error) }),
    );
    try {
      await connection.close();
    } catch {
      // Close is best effort; close handler schedules reconnect.
    }
  }

  private safeError(error: unknown): string {
    return (error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown messaging error')
      .replace(/amqps?:\/\/[^\s]+/gi, '[AMQP_URL]')
      .slice(0, 500);
  }
}
