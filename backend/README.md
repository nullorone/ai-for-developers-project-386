# Backend «Запись на звонок»

NestJS + TypeScript + Prisma (PostgreSQL). Независимый проект: собственные зависимости,
lockfile, скрипты и тесты. Реализация обязана соответствовать корневому
[`openapi.yaml`](../openapi.yaml); контракт **не** генерируется из декораторов NestJS
(ADR 0002).

## Требования

- Node.js `>=20.19.0`; container build закреплен на Node 20.19.5, npm 9+.
- PostgreSQL 16+. HTTP-процесс поднимается и без базы:
  соединение Prisma ленивое, `/health/live` всегда отвечает `200`,
  а `/health` и `/health/ready` честно возвращают `503`, пока база недоступна.

## Быстрый старт

```bash
cd backend
cp .env.example .env
npm install          # postinstall выполняет prisma generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev    # http://localhost:3000/api/v1
curl -s http://localhost:3000/api/v1/health/live
```

## Команды

| Команда                                  | Что делает                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `npm run prisma:generate`                | Генерирует Prisma Client (в `node_modules`)                             |
| `npm run prisma:migrate` / `prisma:seed` | Применяет миграции / идемпотентно создает календарь `demo`              |
| `npm run build`                          | `nest build` → `dist/`                                                  |
| `npm start`                              | `node dist/src/main.js` (требует предварительный `build`)               |
| `npm run start:dev`                      | Watch-режим                                                             |
| `npm run typecheck`                      | `tsc --noEmit`                                                          |
| `npm run lint`                           | ESLint с типизированными правилами, `--max-warnings=0`                  |
| `npm run format` / `format:check`        | Prettier                                                                |
| `npm test`                               | Jest: unit-тесты `src/**/*.spec.ts` и smoke-тест `test/*.e2e-spec.ts`   |
| `npm run test:integration`               | PostgreSQL integration tests; требует доступную тестовую `DATABASE_URL` |
| `npm run test:frontend-integration`      | Real API smoke для guest и owner frontend flows                         |
| `npm run test:cov`                       | Отчет о покрытии                                                        |

## Переменные окружения

В Git хранится только `.env.example`; `.env*` игнорируются. Значения проверяются zod
в [`src/common/config/env.schema.ts`](src/common/config/env.schema.ts) **до** создания
приложения: некорректная конфигурация роняет процесс сразу и с понятным сообщением.

| Переменная                   | По умолчанию                               | Назначение                                         |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `NODE_ENV`                   | `development`                              | Режим запуска                                      |
| `PORT`                       | `3000`                                     | Порт HTTP-сервера                                  |
| `API_PREFIX`                 | `api/v1`                                   | Глобальный префикс из контракта                    |
| `DATABASE_URL`               | — (обязательна)                            | Строка подключения PostgreSQL                      |
| `IDEMPOTENCY_ENCRYPTION_KEY` | — (обязательна)                            | 32-byte hex key для AES-GCM ответа идемпотентности |
| `CORS_ORIGINS`               | local Vite + `https://nullorone.github.io` | Allowlist frontend origin через запятую            |
| `LOG_LEVEL`                  | `log`                                      | `error` \| `warn` \| `log` \| `debug` \| `verbose` |

## Соответствие контракту

Уже на уровне каркаса зафиксированы решения, отличные от умолчаний NestJS:

- глобальный префикс `/api/v1` — контракт объявляет сервер как `http://localhost:3000/api/v1`;
- `ValidationPipe` возвращает `422 VALIDATION_ERROR` вместо `400`
  (`400 MALFORMED_REQUEST` остается за неразбираемым запросом);
- `forbidNonWhitelisted` отражает `additionalProperties: false` во всех схемах;
- любая ошибка отдается как `application/problem+json` по схеме `Error`
  с полями `code`, `message`, `requestId`, `timestamp`;
- каждый ответ содержит `X-Request-Id`; входящий заголовок принимается, только если
  это UUID;
- заголовок `X-Powered-By` отключен (правило N-10).

`GET /health`, `/health/live`, `/health/ready` возвращают схему `HealthStatus`;
при неготовности — `503` с тем же телом, а не с `Error`.

## Структура

```text
prisma/                 # доменная schema, SQL migration и идемпотентный seed
src/
├── common/             # контрактные типы, конфигурация, фильтр ошибок, request id, валидация
├── prisma/             # PrismaService (ленивое соединение) и глобальный PrismaModule
├── health/             # пробы работоспособности
├── calendars/          # публичный read endpoint и repository
├── availability/       # owner CRUD, validation и persistence boundary
├── slots/              # чистая генерация и публичный slots endpoint
├── owner/              # будущие встречи и read endpoint слотов переноса
├── bookings/           # create/cancellation, token security, idempotency и rate limit
├── messaging/          # RabbitMQ connection, outbox publisher и metrics
├── notifications/      # идемпотентный consumer с retry/DLQ
├── bootstrap.ts        # единая настройка приложения для main.ts и e2e-тестов
└── main.ts
test/                   # smoke-тест health и подготовка окружения тестов
```

## Prisma и PostgreSQL

Схема содержит `Calendar`, `AvailabilityWindow`, `Booking`, `SlotReservation`,
`OutboxEvent` и `NotificationLog`. Ограничения, которые Prisma не выражает (GiST exclusion
для окон и partial unique indexes активных reservations), находятся в SQL migration и
описаны в [`docs/data-model.md`](../docs/data-model.md).

## Тесты

Обычный `npm test` запускает unit/e2e без обязательной базы; database suite пропускается.
Для реального PostgreSQL задайте тестовую (не production) `DATABASE_URL` и выполните
`npm run prisma:migrate && npm run prisma:seed && npm run test:integration`.

Логи запросов намеренно не содержат headers, body или query: management token и персональные
данные не логируются. Для 5xx пишутся только request id, HTTP method, безопасный path и stack;
наружу внутреннее сообщение не возвращается.

## Транзакционный lifecycle

Create, guest cancellation и owner reschedule реализованы по
[`ADR 0003`](../docs/adr/0003-booking-transaction-and-idempotency.md). Active slot защищен
partial unique index PostgreSQL, а Booking/reservation/outbox меняются одной транзакцией.
`Idempotency-Key` хранится только как SHA-256; воспроизводимый 24 часа ответ зашифрован
AES-256-GCM. RabbitMQ получает события из transactional outbox и доставляет их at-least-once.
