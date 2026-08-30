# Стратегия тестирования MVP

Статус: принято на этапе 9. Источники: [продуктовые требования](product-requirements.md),
[OpenAPI](../openapi.yaml), [ADR 0001](adr/0001-mvp-scope-and-architecture.md),
[ADR 0002](adr/0002-api-contract-decisions.md) и
[ADR 0003](adr/0003-booking-transaction-and-idempotency.md).

## Приоритеты и пирамида

Цель набора — ловить нарушения наблюдаемого поведения и MVP-инвариантов, а не достигать
формального процента покрытия.

1. Unit: генерация слотов, диапазоны, UTC/DST, validation/error mapping, hashing и шифрование
   идемпотентного ответа. Это самый быстрый слой, он использует fake clock.
2. React component/integration: пользовательские состояния и клиентский OpenAPI adapter через
   детерминированный contract fixture.
3. PostgreSQL API/integration: реальные миграции, constraints, транзакции, outbox, идемпотентность
   и гонки. In-memory БД не используется.
4. RabbitMQ integration: реальные PostgreSQL и RabbitMQ в Testcontainers, broker outage,
   восстановление, повторная доставка, retry и DLQ.
5. Playwright: Chromium-путь пользователя через настоящий Vite/React runtime и
   детерминированный HTTP fixture. Реальная транзакционная связка frontend ↔ API проверяется
   отдельно в `frontend-backend.integration.e2e-spec.ts`.
6. Contract: Spectral и operationId checks проверяют источник истины; frontend types каждый раз
   генерируются из `openapi.yaml`, а PostgreSQL API tests закрепляют happy DTO и стабильные error
   codes. Поэтому несовместимый drift ломает lint/typecheck или observable API assertions.

Retry тестов отключен. Ожидания асинхронности опрашивают наблюдаемое условие с deadline; fixed
sleep для подтверждения результата не используется.

## Test data policy

- Unit и UI tests создают данные внутри теста; часы фиксируются или вычисляются относительно
  запроса. Playwright использует абсолютный fixture и browser timezone `UTC`.
- PostgreSQL suites получают уникальный одноразовый контейнер. Миграции и seed применяются с
  нуля. `beforeEach` очищает зависимые таблицы в порядке внешних ключей и создает только нужную
  availability.
- RabbitMQ suite получает отдельные PostgreSQL и RabbitMQ. Очереди не общие с dev/production;
  outage выполняется штатным `rabbitmqctl stop_app/start_app`.
- Тестовые токены, ключ шифрования и credentials фиктивны. Значения production не читаются.
- Тесты не зависят от порядка. Backend fake clock — `2026-09-01T08:00:00Z`; расчеты API идут в
  UTC. Browser E2E фиксирует locale и timezone.
- Testcontainers и Nest applications закрываются в `finally`/`afterAll`. Контейнерный runner
  останавливает PostgreSQL даже при ошибке дочернего процесса.

## Команды

### Быстрый режим без инфраструктуры

```bash
npm run lint
cd backend && npm run lint && npm run typecheck && npm test && npm run test:cov
cd frontend && npm run lint && npm run typecheck && npm run test:run && npm run build
```

`npm test` backend намеренно пропускает suites с `RUN_DATABASE_TESTS` и
`RUN_MESSAGING_TESTS`. Coverage thresholds заданы для domain/application модулей availability,
booking, slots, slot generator, idempotency crypto и validation; глобальный порог не используется,
чтобы infrastructure adapters не стимулировали бессодержательные тесты.

### Полный режим на чистой инфраструктуре

Требуются Docker и установленные зависимости трех независимых пакетов.

```bash
cd backend
npm run test:integration:container
npm run test:concurrency:container
npm run test:messaging
npm run test:full

cd ../frontend
npx playwright install chromium
npm run test:e2e:chromium
```

`test:concurrency:container` повторяет три критические гонки 10 раз. `test:full` создает чистый
PostgreSQL для unit/API/integration с `--detectOpenHandles`, затем отдельные чистые PostgreSQL и
RabbitMQ для messaging. На managed laptop можно использовать системный Chrome; канал задается
через `PLAYWRIGHT_BROWSER_CHANNEL`, CI по умолчанию использует установленный Playwright Chromium.

### Измеренное время

Локальный прогон 2026-08-30, macOS arm64, warm Docker image cache:

| Набор | Результат | Время |
| --- | --- | ---: |
| Backend fast | 47 тестов | 4.9 с |
| Backend coverage | thresholds пройдены | 4.5 с |
| Frontend Vitest | 31 тест | 1.35 с |
| PostgreSQL integration | 17 тестов | 4.6 с Jest, около 16 с с контейнером |
| Concurrency ×10 | 30 критических запусков | около 23 с с контейнером |
| RabbitMQ integration | 2 теста | 14.1 с |
| Playwright Chromium | 3 теста | 9.3 с |
| Backend full clean | 66 тестов, два инфраструктурных этапа | 24.6 с |

Время загрузки отсутствующих Docker images или браузера в таблицу не входит.

## Traceability matrix

Сокращения уровней: U — unit, C — contract/component, P — PostgreSQL API/integration,
M — RabbitMQ, E — Playwright E2E.

| Требование | Уровень | Автоматическая проверка |
| --- | --- | --- |
| US-G1 AC1–AC2: календарь/not found | P, C | `backend/test/database.integration.e2e-spec.ts`; `frontend/src/shared/api/bookingApi.test.ts` |
| US-G1 AC3: подпись timezone | C | `frontend/tests/booking-flows.test.tsx`; `frontend/src/shared/lib/dateTime.test.ts` |
| US-G2 AC1–AC4: генерация, occupied, lead time, пересечение range | U, P | `backend/src/slots/slot-generator.service.spec.ts`; `backend/test/database.integration.e2e-spec.ts` |
| US-G2 AC5: недопустимые диапазоны | U, P | `backend/src/slots/slots.service.spec.ts`; `backend/test/database.integration.e2e-spec.ts` |
| US-G2 AC6–AC7: empty и безопасный повтор | C, U | `frontend/tests/booking-flows.test.tsx`; `backend/src/slots/slot-generator.service.spec.ts` |
| US-G3 AC1–AC2: create и занятый слот | P, E | `backend/test/booking-lifecycle.integration.e2e-spec.ts`; `frontend/e2e/booking-flows.spec.ts` |
| US-G3 AC3: create/create | P | `backend/test/booking-lifecycle.integration.e2e-spec.ts`, 10 повторов контейнерным runner |
| US-G3 AC4–AC5: grid/availability/прошлое/lead time | U, P | `backend/src/bookings/bookings.service.spec.ts`; `backend/test/database.integration.e2e-spec.ts` |
| US-G3 AC6–AC7: idempotency replay/reuse | U, P | `backend/src/bookings/idempotency-crypto.service.spec.ts`; `backend/test/booking-lifecycle.integration.e2e-spec.ts` |
| US-G3 AC8: поля формы | C, P | `frontend/tests/booking-flows.test.tsx`; `backend/src/common/validation/validation.pipe.spec.ts` |
| US-G3 AC9: confirmation/time/token fragment | C, E | `frontend/tests/booking-flows.test.tsx`; `frontend/e2e/booking-flows.spec.ts` |
| US-G4 AC1–AC3: token view, indistinguishable denial, cancelled view | U, P, C | `backend/src/bookings/bookings.service.spec.ts`; `backend/test/booking-lifecycle.integration.e2e-spec.ts`; `frontend/tests/booking-flows.test.tsx` |
| US-G4 AC4: token только во fragment/header | C, E | `frontend/tests/booking-flows.test.tsx`; `frontend/e2e/booking-flows.spec.ts` |
| US-G5 AC1–AC5: cancel/repeat/invalid/past/UI | P, C, E | `backend/test/booking-lifecycle.integration.e2e-spec.ts`; `frontend/tests/booking-flows.test.tsx`; `frontend/e2e/booking-flows.spec.ts` |
| US-O1 AC1–AC6: create, grid, past, overlap, limits | U, P, C | `backend/src/availability/availability.service.spec.ts`; `backend/test/database.integration.e2e-spec.ts`; `frontend/tests/booking-flows.test.tsx` |
| US-O1 AC7: concurrent overlap | P | DB exclusion constraint проверяется в `backend/test/database.integration.e2e-spec.ts`; отдельная concurrent availability нагрузка — gap ниже |
| US-O2 AC1–AC5: sorted list/delete/conflict/not found/past | P, C | `backend/test/database.integration.e2e-spec.ts`; `frontend/tests/booking-flows.test.tsx` |
| US-O3 AC1–AC5: future owner list, filtering, privacy | P, C | `backend/test/frontend-backend.integration.e2e-spec.ts`; `frontend/tests/booking-flows.test.tsx` |
| US-O4 AC1–AC4: варианты переноса/current/inapplicable/not found | P, C | `backend/test/frontend-backend.integration.e2e-spec.ts`; `frontend/tests/booking-flows.test.tsx` |
| US-O5 AC1–AC5, AC7–AC8: atomic reschedule/rollback/validation/no-op/duration | P, C | `backend/test/booking-lifecycle.integration.e2e-spec.ts`; `frontend/tests/booking-flows.test.tsx` |
| US-O5 AC6: reschedule/reschedule | P | `backend/test/booking-lifecycle.integration.e2e-spec.ts`, 10 повторов контейнерным runner |
| US-S1 AC1–AC4: outbox, outage recovery, duplicate, retry/DLQ | P, M | `backend/test/booking-lifecycle.integration.e2e-spec.ts`; `backend/test/messaging.integration.e2e-spec.ts` |
| US-S2 AC1–AC2: liveness/readiness | C | `backend/test/health.e2e-spec.ts`; `backend/src/health/health.service.spec.ts` |
| T-1–T-10: UTC, range и DST boundaries | U, C, P | `backend/src/slots/slot-generator.service.spec.ts`; `backend/src/common/validation/validation.pipe.spec.ts`; `frontend/src/shared/lib/dateTime.test.ts` |
| M-1–M-14: token entropy/hash/validation/no persistence | U, P, C, E | `backend/src/bookings/bookings.service.spec.ts`; `backend/test/booking-lifecycle.integration.e2e-spec.ts`; `frontend/tests/booking-flows.test.tsx`; `frontend/e2e/booking-flows.spec.ts` |
| N-1–N-6, N-14, N-18, N-21–N-22 | P, M, C | lifecycle/database/messaging/health integration suites; root OpenAPI lint и generated frontend typecheck |

## Оставшиеся gaps и ручные проверки

- US-O1 AC7 защищен PostgreSQL exclusion constraint, но отдельный тест двух конкурентных HTTP
  create availability пока не добавлен. Риск ниже booking/reschedule races, но такой тест нужен при
  расширении owner-функций.
- N-7 performance p95 не проверяется функциональным suite: нужны отдельный профиль нагрузки и
  окружение, похожее на production; локальные Testcontainers не дают репрезентативной метрики.
- N-11 rate limiting и N-17 structured correlation покрыты частично и требуют отдельной security /
  observability проверки до production.
- Кроссбраузерность N-23 и screen reader/keyboard accessibility проверяются вручную перед релизом;
  обязательный автоматический browser gate MVP — Chromium. Firefox/WebKit можно добавить без
  изменения сценариев после доступности browser binaries в CI.
- Playwright fixture проверяет браузер и контрактные запросы, но не поднимает весь backend.
  Сквозная реальная API/DB граница покрывается Supertest suite; после появления Compose на этапе 10
  стоит добавить один thin full-stack browser smoke.
