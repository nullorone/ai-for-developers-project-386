# Этап 7. RabbitMQ, transactional outbox и consumer

## Промпт агенту

Ты — senior backend/integration engineer. Подключи RabbitMQ так, чтобы отказ брокера не приводил к потере бронирования или доменного события.

Прочитай overview, требования, ADR транзакционного жизненного цикла, OpenAPI и текущий backend. Доменные use cases этапа 6 уже создают OutboxEvent; не меняй их на прямую публикацию в брокер.

## Цель

Надежно доставлять `booking.created`, `booking.cancelled`, `booking.rescheduled` и идемпотентно имитировать уведомления в одном развертываемом NestJS-приложении.

## Выполни

1. Определи versioned event envelope: eventId, eventType, version, occurredAt, aggregateId, correlationId и payload без лишних персональных данных.
2. Реализуй подключение RabbitMQ с подтверждением publisher, reconnect/backoff, конфигурацией через env и graceful shutdown.
3. Настрой durable exchange/queues/bindings, retry policy и dead-letter queue. Топология должна создаваться приложением идемпотентно.
4. Реализуй outbox publisher:
   - забирает ограниченную batch записей;
   - безопасен при повторном запуске и по возможности при нескольких экземплярах;
   - публикует persistent message;
   - помечает event опубликованным только после broker confirm;
   - записывает attempts и последнюю ошибку без секретов;
   - не удерживает database transaction во время долгого network call без необходимости.
5. Реализуй consumer внутри backend-процесса:
   - обрабатывает три event type;
   - создает `NotificationLog` как имитацию уведомления;
   - дедуплицирует по eventId на уровне БД;
   - ack делает после успешной транзакционной обработки;
   - временные ошибки ведут к ограниченному retry, затем DLQ.
6. Сделай messaging lifecycle отключаемым для некоторых режимов (`MESSAGING_ENABLED`) без изменения доменной логики.
7. Добавь health/readiness информацию о PostgreSQL и RabbitMQ так, чтобы временная недоступность брокера была видна, но не уничтожала уже сохраненные бронирования.
8. Добавь метрики/structured logs для backlog outbox, publish failures, retries, DLQ и consumer duplicates.
9. Добавь integration tests через Testcontainers RabbitMQ/PostgreSQL.
10. Создай `docs/messaging.md` со схемой доставки, гарантиями at-least-once и инструкцией повторной обработки DLQ.
11. Обнови `docs/ai-development-log.md`.

## Ограничения

- Не создавай отдельный deployable worker-каталог или микросервис.
- Не обещай exactly-once delivery; обеспечь at-least-once плюс idempotent consumer.
- Не отправляй management token или полный comment в event payload.
- Не подтверждай сообщение до фиксации NotificationLog.
- Не удаляй опубликованные outbox records немедленно; оставь возможность аудита/регламентированной очистки.

## Критерии приемки

- Бронирование успешно создается при остановленном RabbitMQ.
- После восстановления pending события доставляются.
- Повтор одного event не создает два NotificationLog.
- После ограниченного числа ошибок сообщение оказывается в DLQ.
- Рестарт приложения не теряет pending/processing events.
- Все три event type покрыты тестами.

## Проверка

- Запусти integration tests с реальными контейнерами PostgreSQL/RabbitMQ.
- Проведи smoke-сценарий: остановить broker, создать booking, запустить broker, дождаться NotificationLog.
- Опубликуй duplicate event и проверь идемпотентность.
- Искусственно сломай consumer и проверь retry/DLQ.
- Запусти lint, typecheck, tests и build backend.
- В отчете опиши delivery guarantees и известные failure windows.

