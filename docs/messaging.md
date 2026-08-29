# RabbitMQ, transactional outbox и уведомления

## Схема доставки

```text
HTTP use case ── одна PostgreSQL transaction ──> Booking + OutboxEvent(PENDING)
                                                      │
                       claim lease / SKIP LOCKED      │
                                                      ▼
NestJS outbox publisher ── persistent + confirm ──> booking.events.v1
                                                      │
                                                      ▼
                                             booking.notifications.v1
                                                      │
                      transaction: Booking lookup + NotificationLog(eventId UNIQUE)
                                                      │
                                    commit ───────────> ack
                                      │ error
                                      ▼
                         booking.notifications.retry.v1 (TTL)
                                      │ retries exhausted
                                      ▼
                         booking.notifications.dlq.v1
```

Топология (exchange, main/retry/DLQ queues и bindings) durable и объявляется приложением
идемпотентно при каждом соединении. В одном NestJS-процессе работают HTTP API, publisher и
consumer; отдельного deployable worker нет. `MESSAGING_ENABLED=false` отключает connection,
publisher и consumer, не меняя запись доменной транзакции в outbox.

## Envelope v1

Каждое `booking.created`, `booking.cancelled` и `booking.rescheduled` публикуется как JSON:

```json
{
  "eventId": "uuid outbox record",
  "eventType": "booking.created",
  "version": 1,
  "occurredAt": "2026-08-27T12:00:00.000Z",
  "aggregateId": "booking uuid",
  "correlationId": "stable uuid",
  "payload": { "bookingId": "booking uuid", "startsAt": "...", "endsAt": "..." }
}
```

В payload нет management token, его хеша, имени, email или comment. Consumer получает email
по `bookingId` из PostgreSQL; его значение не проходит через broker.

## Гарантии и failure windows

Гарантия — **at-least-once**, не exactly-once. Publisher выбирает ограниченный batch с
`FOR UPDATE SKIP LOCKED`, кратко записывает lease и освобождает database transaction до
сетевого вызова. `PUBLISHED` ставится только после publisher confirm. Если процесс упал после
confirm, но до обновления outbox, событие будет опубликовано повторно после lease. Unique
constraint `NotificationLog.eventId` превращает повтор в успешный ack без второго уведомления.

Consumer ack выполняется только после commit транзакции `NotificationLog`. При временной
ошибке он publisher-confirmed отправляет копию в retry exchange и лишь затем ack исходное
сообщение. После `RABBITMQ_RETRY_LIMIT` попыток сообщение подтвержденно отправляется в DLQ.
При сбое republish исходное сообщение requeue-ится. Опубликованные OutboxEvent сохраняются
для аудита; их очистка — отдельная регламентная операция.

## Health, logs и эксплуатация

`/api/v1/health/ready` показывает `database` и, когда messaging включен, `messageBroker`.
Недоступный broker дает degraded readiness, но создание/отмена/перенос продолжают атомарно
сохраняться в PostgreSQL. Structured JSON logs содержат backlog, publish failures, retries,
DLQ и duplicates без connection URL и персональных данных.

## Повторная обработка DLQ

1. Исправить первопричину и убедиться, что PostgreSQL/RabbitMQ healthy.
2. Проверить headers и envelope сообщения без выгрузки recipient или секретов в логи.
3. Перепубликовать исходный body в `booking.events.v1` с routing key из `eventType`, сохранив
   `eventId`, persistent delivery mode и очистив `x-retry-count`/`x-failure-reason`.
4. Только после publisher confirm удалить/ack исходное сообщение DLQ.
5. Проверить `NotificationLog` по eventId. Повтор уже обработанного события безопасен.

Для массового replay следует ограничивать скорость и сначала сохранить backup DLQ. Нельзя
перегенерировать eventId: это отключит database-дедупликацию.
