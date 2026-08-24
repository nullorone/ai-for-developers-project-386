# Этап 9. Полный набор тестов

## Промпт агенту

Ты — senior SDET/backend engineer. Проведи аудит существующих тестов и закрой критические риски MVP, не гоняясь за формальным процентом покрытия.

Прочитай overview, требования и acceptance criteria, OpenAPI, ADR, код и текущие тесты. Составь traceability matrix «требование → уровень теста → файл теста».

## Цель

Получить надежную, воспроизводимую и разумную по времени пирамиду тестов, которая ловит ошибки контракта, времени, транзакций и асинхронной доставки.

## Выполни

1. Создай `docs/test-strategy.md` с уровнями, test data policy, командами и traceability matrix.
2. Дополни unit tests:
   - slot generation и диапазоны;
   - пересечение availability;
   - прошлое время;
   - UTC и DST display boundaries;
   - token hashing/validation;
   - error mapping.
3. Дополни PostgreSQL integration tests:
   - миграции/constraints;
   - create/idempotency;
   - cancel/repeat cancel;
   - reschedule/rollback;
   - outbox atomicity.
4. Дополни API/contract tests по OpenAPI для happy paths и стабильных error codes.
5. Дополни RabbitMQ tests: recovery после недоступности, duplicate delivery, retry и DLQ.
6. Сделай детерминированные concurrency tests минимум для create/create, reschedule/reschedule и create/reschedule на один слот.
7. Настрой Playwright E2E:
   - гость бронирует и отменяет по token link;
   - владелец создает availability и переносит встречу;
   - один conflict UI scenario.
8. Изолируй данные каждого теста, используй fake clock там, где возможно, и не делай fixed sleep.
9. Настрой разумные coverage thresholds на критические domain/application modules, не требуя 100% всего проекта.
10. Найденные продуктовые дефекты исправляй минимально и добавляй regression test.
11. Обнови `docs/ai-development-log.md`.

## Ограничения

- Не подменять PostgreSQL/RabbitMQ in-memory реализациями в integration tests.
- Не использовать production credentials/services.
- Не скрывать flaky tests retries без анализа причины.
- Не тестировать детали реализации там, где важнее observable behavior.
- Не обновлять snapshots вслепую.

## Критерии приемки

- Все acceptance criteria связаны хотя бы с одним тестом или имеют явное объяснение ручной проверки.
- Critical concurrency tests стабильны при многократном запуске.
- E2E воспроизводимы на чистом окружении.
- Contract drift обнаруживается автоматически.
- Test suite не зависит от порядка выполнения и локальной timezone.
- Документация объясняет быстрый и полный режимы тестов.

## Проверка

- Запусти быстрые тесты отдельно и полный suite на чистых контейнерах.
- Повтори concurrency suite минимум 10 раз или обоснованное число.
- Запусти E2E минимум в Chromium.
- Проверь отсутствие открытых handles/контейнеров после завершения.
- В отчете дай время выполнения наборов, покрытые риски и оставшиеся gaps.

