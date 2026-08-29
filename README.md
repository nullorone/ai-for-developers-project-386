# «Запись на звонок»

### Hexlet tests and linter status:
[![Actions Status](https://github.com/nullorone/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/nullorone/ai-for-developers-project-386/actions)

Компактное веб-приложение по мотивам Cal.com: владелец публикует интервалы доступности,
гость бронирует свободный 30-минутный слот и может отменить встречу по защищенной ссылке,
владелец — перенести ее на другой свободный слот.

Проект разрабатывается в подходе **Design First**: источник истины — корневой
[`openapi.yaml`](openapi.yaml). Frontend и backend — независимые приложения, которые
связаны только контрактом.

## Статус

Этап 8 из 13: frontend подключен к реальному NestJS API; guest и owner flow работают через
PostgreSQL. Backend реализует транзакционный lifecycle, RabbitMQ publisher/consumer, retry и DLQ.
Prism и stateful mock используются только изолированно и в тестах. Docker Compose появится на
этапе 10 — см. [`llm/README.md`](llm/README.md).

## Структура репозитория

```text
.
├── openapi.yaml     # контракт REST API (OpenAPI 3.1) — источник истины
├── .spectral.yaml   # правила линтера контракта
├── package.json     # ТОЛЬКО contract tooling (Spectral, Prism). Это не workspace
├── scripts/         # проверки контракта и smoke-тест mock server
├── frontend/        # React + TypeScript + Vite (независимый проект)
├── backend/         # NestJS + TypeScript + Prisma (независимый проект)
├── docs/            # требования, описание API, ADR, журнал LLM-разработки
└── llm/             # промпты этапов разработки
```

Корневой `package.json` **не** содержит поля `workspaces`: `frontend/` и `backend/`
устанавливаются, собираются, тестируются и деплоятся независимо (ADR 0001).
Общего пакета кода или типов между ними нет.

## Требования к окружению

- Node.js `>=20.6.0`; проверено на **Node 20.6.1 / npm 9.8.1**.
- npm 9+ (по одному lockfile на каждый проект).
- PostgreSQL 16+ нужен для доменных endpoints; `/health/live` доступен и без базы.
- Docker не требуется: локальный запуск полностью работает без него.

## Локальный запуск без Docker

Три независимых установки зависимостей — по одной на корень, frontend и backend.

### 1. Контракт (опционально, но полезно)

```bash
npm install
npm run lint          # Spectral + проверка operationId и закрытости DTO
npm run mock          # Prism mock API на http://127.0.0.1:4010
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # при необходимости поправьте DATABASE_URL
npm install                   # postinstall выполнит prisma generate
npm run prisma:migrate
npm run prisma:seed           # повторный запуск безопасен
npm run start:dev             # http://localhost:3000/api/v1

curl -s http://localhost:3000/api/v1/health/live
```

`/health/live` отвечает `200` всегда. `/health` и `/health/ready` возвращают `503`,
пока PostgreSQL недоступен, — это ожидаемое поведение по контракту, а не ошибка каркаса.

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:5173
```

По умолчанию frontend смотрит на реальный backend (`http://localhost:3000/api/v1`). Для
изолированной работы с Prism запустите root-команду `npm run mock` и задайте перед `npm run dev`
`VITE_API_BASE_URL=http://127.0.0.1:4010`.

### Порты

| Сервис | Порт |
| --- | --- |
| Prism mock | 4010 |
| Backend | 3000 |
| Frontend dev | 5173 |
| Frontend preview | 4173 |

## Проверки качества

Каждый проект проверяется отдельно, из своего каталога:

```bash
cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build
cd backend  && npm run lint && npm run typecheck && npm test && npm run build
npm run lint   # в корне: линт контракта
```

Сквозные API smoke-тесты guest cancellation и owner reschedule требуют отдельную тестовую базу:
`cd backend && npm run test:frontend-integration`.

## Генерация API-клиента frontend

Клиент frontend генерируется из корневого контракта командой:

```bash
cd frontend && npm run api:generate   # → src/shared/api/generated/schema.d.ts
```

**Сгенерированный код не коммитится и не редактируется вручную.** Решение осознанное:
генерация детерминирована, не требует сети и запускается автоматически перед `dev`,
`typecheck`, `test` и `build` (`pre*`-скрипты npm). Поэтому свежая копия репозитория
собирается одной командой `npm ci && npm run build`, а расхождение кода с контрактом
невозможно «протащить» в коммит. Prisma Client генерируется аналогично
(`postinstall` в `backend/`) и живет в `node_modules`.

## Секреты и переменные окружения

В репозитории нет секретов. В Git хранятся только `frontend/.env.example` и
`backend/.env.example`; реальные `.env`, `.env.local` и подобные файлы игнорируются.
Значения в примерах — локальные заглушки для разработки.

## Известные ограничения MVP

- **Owner-интерфейс публичен.** Аутентификации в MVP нет: любой, кто знает адрес,
  может управлять доступностью и переносить встречи. Это осознанное учебное ограничение
  (ADR 0001, риск K-1) и **неприемлемое условие для production**. Смягчается только
  ограничением частоты запросов и сокращением персональных данных в ответах.
- Настоящих писем нет: уведомления имитируются и пишутся в `NotificationLog`.
- Внешние календари, recurring availability, отмена владельцем и перенос гостем
  вне scope.

## Документация

- [Продуктовые требования](docs/product-requirements.md)
- [Контракт API: структура, lint и mock](docs/api.md)
- [Модель данных и ER diagram](docs/data-model.md)
- [ADR 0001. Scope MVP и базовая архитектура](docs/adr/0001-mvp-scope-and-architecture.md)
- [ADR 0002. Решения API-контракта](docs/adr/0002-api-contract-decisions.md)
- [ADR 0003. Транзакции и идемпотентность](docs/adr/0003-booking-transaction-and-idempotency.md)
- [Журнал LLM-разработки](docs/ai-development-log.md)
- [Frontend README](frontend/README.md) · [Backend README](backend/README.md)
