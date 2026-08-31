import { Injectable, Logger } from '@nestjs/common';

export type MessagingMetric =
  'outbox_publish_failures' | 'consumer_retries' | 'consumer_dlq' | 'consumer_duplicates';

@Injectable()
export class MessagingMetricsService {
  private readonly logger = new Logger(MessagingMetricsService.name);
  private lastBacklog: number | null = null;
  private readonly counters: Record<MessagingMetric, number> = {
    outbox_publish_failures: 0,
    consumer_retries: 0,
    consumer_dlq: 0,
    consumer_duplicates: 0,
  };

  increment(metric: MessagingMetric, fields: Record<string, unknown> = {}): void {
    this.counters[metric] += 1;
    this.logger.log(
      JSON.stringify({ kind: 'metric', metric, value: this.counters[metric], ...fields }),
    );
  }

  backlog(value: number): void {
    if (value === this.lastBacklog) return;
    this.lastBacklog = value;
    this.logger.log(JSON.stringify({ kind: 'metric', metric: 'outbox_backlog', value }));
  }

  snapshot(): Readonly<Record<MessagingMetric, number>> {
    return { ...this.counters };
  }
}
