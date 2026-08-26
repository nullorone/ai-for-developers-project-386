# API-контракт: структура, проверка и mock

Статус: принято (этап 2).
Источник истины: корневой [`openapi.yaml`](../openapi.yaml) (OpenAPI 3.1).
Связанные документы: [Продуктовые требования](product-requirements.md), [ADR 0001](adr/0001-mvp-scope-and-architecture.md), [ADR 0002](adr/0002-api-contract-decisions.md).

Контракт написан до frontend и backend (Design First). Из него генерируются mock-сервер,
клиент frontend и контрактные проверки backend. Контракт **не** выводится из декораторов
NestJS и не меняется молча: правка требует обоснования и синхронного обновления реализации.

## 1. Быстрый старт

```bash
npm install          # ставит только contract tooling: Spectral, Prism, yaml
npm run lint         # OpenAPI lint + проверка operationId и закрытости DTO
npm run mock         # mock server на http://127.0.0.1:4010
npm run smoke:mock   # автоматическая smoke-проверка mock по happy path и ошибкам
```

Требуется Node.js 20+. Корневой `package.json` — это **не** workspace: он не содержит
поля `workspaces` и не управляет зависимостями `frontend/` и `backend/`, которые остаются
независимыми проектами (ADR 0001).

## 2. Команды

| Команда | Что делает |
| --- | --- |
| `npm run lint:openapi` | Spectral по правилам [`.spectral.yaml`](../.spectral.yaml); падает на severity `warn` и выше |
| `npm run lint:operation-ids` | [`scripts/check-operation-ids.mjs`](../scripts/check-operation-ids.mjs): наличие и уникальность `operationId`, отсутствие токена в path/query, `additionalProperties: false` у всех схем-объектов |
| `npm run lint` | обе проверки подряд; эта команда пойдет в CI на этапе 11 |
| `npm run mock` | Prism в статическом режиме: возвращает примеры из контракта |
| `npm run mock:dynamic` | Prism в динамическом режиме: генерирует данные по схемам |
| `npm run smoke:mock` | поднимает Prism на свободном порту, проходит 24 проверки и гасит процесс |

Все команды воспроизводимы без глобальных установок: бинарники берутся из `node_modules/.bin`.
Разовый запуск без установки зависимостей:

```bash
npx @stoplight/spectral-cli lint openapi.yaml --ruleset .spectral.yaml --fail-severity warn
npx @stoplight/prism-cli mock openapi.yaml --port 4010 --host 127.0.0.1
```

## 3. Mock server

### Базовый адрес

Prism отбрасывает базовый путь сервера и обслуживает операции **от корня**:
контракт объявляет боевой сервер как `http://localhost:3000/api/v1`, а mock доступен
по `http://127.0.0.1:4010/calendars/demo`, без префикса `/api/v1`. Frontend на этапе 4
задает базовый URL переменной окружения, поэтому разница префиксов не требует правок кода.

### Примеры запросов

```bash
# Календарь
curl -s http://127.0.0.1:4010/calendars/demo

# Свободные слоты на неделю
curl -s "http://127.0.0.1:4010/calendars/demo/slots?from=2026-09-01T00:00:00Z&to=2026-09-08T00:00:00Z"

# Создание бронирования
curl -s -X POST http://127.0.0.1:4010/calendars/demo/bookings \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 8f14e45fceea167a5a36dedd4bea2543' \
  -d '{"startsAt":"2026-09-01T09:00:00Z","guestName":"Alex Guest","guestEmail":"guest@example.com"}'

# Просмотр и отмена по management token
curl -s http://127.0.0.1:4010/bookings/8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10/cancellation \
  -H 'X-Booking-Token: 6Qk9m2Xh1sT0pV7cRb4YwLdF3nJgZaEu8HrKtN5MvQo'

# Перенос встречи владельцем
curl -s -X PATCH http://127.0.0.1:4010/owner/bookings/8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10/schedule \
  -H 'Content-Type: application/json' \
  -d '{"startsAt":"2026-09-01T10:00:00Z"}'
```

### Выбор конкретного ответа и примера

Prism поддерживает заголовок `Prefer`, что позволяет проиграть любую ветку контракта:

```bash
# Ошибка «слот занят»
curl -s -X POST http://127.0.0.1:4010/calendars/demo/bookings \
  -H 'Content-Type: application/json' \
  -H 'Prefer: code=409, example=slotTaken' \
  -d '{"startsAt":"2026-09-01T09:00:00Z","guestName":"Alex Guest","guestEmail":"guest@example.com"}'

# Отказ по management token
curl -s http://127.0.0.1:4010/bookings/8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10/cancellation \
  -H 'X-Booking-Token: 6Qk9m2Xh1sT0pV7cRb4YwLdF3nJgZaEu8HrKtN5MvQo' \
  -H 'Prefer: code=403'

# Пустой список слотов
curl -s "http://127.0.0.1:4010/calendars/demo/slots?from=2026-09-01T00:00:00Z&to=2026-09-08T00:00:00Z" \
  -H 'Prefer: example=empty'
```

Флаг `--errors` (включен в `npm run mock`) заставляет Prism отклонять запросы,
не соответствующие контракту. Это полезно frontend-разработке: неизвестное поле в теле
или отсутствующий обязательный заголовок сразу дают ошибку, а не «молчаливый» успех.

## 4. Обзор endpoints

Все пути даны относительно базового пути `/api/v1` боевого сервера.

### Публичные

| Метод и путь | operationId | Успех | Ключевые ошибки |
| --- | --- | --- | --- |
| `GET /calendars/{slug}` | `getCalendarBySlug` | 200 | 404, 429, 500 |
| `GET /calendars/{slug}/slots` | `listCalendarSlots` | 200 | 400, 404, 422, 429, 500 |
| `POST /calendars/{slug}/bookings` | `createBooking` | 201 | 400, 404, 409, 422, 429, 500 |
| `GET /bookings/{bookingId}/cancellation` | `getBookingCancellation` | 200 | 400, 403, 429, 500 |
| `POST /bookings/{bookingId}/cancellation` | `confirmBookingCancellation` | 200 | 400, 403, 409, 429, 500 |

### Owner

| Метод и путь | operationId | Успех | Ключевые ошибки |
| --- | --- | --- | --- |
| `GET /owner/availability` | `listOwnerAvailability` | 200 | 429, 500 |
| `POST /owner/availability` | `createOwnerAvailabilityWindow` | 201 | 400, 409, 422, 429, 500 |
| `DELETE /owner/availability/{windowId}` | `deleteOwnerAvailabilityWindow` | 204 | 404, 409, 429, 500 |
| `GET /owner/bookings` | `listOwnerBookings` | 200 | 429, 500 |
| `GET /owner/bookings/{bookingId}/available-slots` | `listOwnerBookingRescheduleSlots` | 200 | 400, 404, 409, 422, 429, 500 |
| `PATCH /owner/bookings/{bookingId}/schedule` | `rescheduleOwnerBooking` | 200 | 400, 404, 409, 422, 429, 500 |

Owner-эндпоинты публичны: аутентификации в MVP нет (ADR 0001, риск K-1).

### Служебные

| Метод и путь | operationId | Успех | Ошибки |
| --- | --- | --- | --- |
| `GET /health` | `getHealth` | 200 | 503 |
| `GET /health/live` | `getLiveness` | 200 | — |
| `GET /health/ready` | `getReadiness` | 200 | 503 |

## 5. Соглашения контракта

### Время

Один формат: RFC 3339 UTC с суффиксом `Z`, точность до секунд (правило T-1). Схема
`UtcTimestamp` закрепляет это регулярным выражением, а `SlotBoundary` дополнительно
требует минуты `00` или `30` и нулевые секунды (правила A-3, T-3). Клиент никогда
не передает `endsAt`: конец вычисляет сервер (правила B-2, R-2).

### Управление слотами

Диапазон запроса слотов задается обязательными `from` и `to` (правило S-4) и ограничен
правилом S-5: `to > from`, длина не более 31 дня, `from >= now - 1 день`,
`to <= now + 90 дней`. Отбор — по `from <= slot.startsAt < to` (правило S-6).
Пагинации нет: максимум 1488 слотов на ответ (правило S-8), что закреплено в схеме
через `maxItems`.

### Management token

Токен передается только заголовком `X-Booking-Token`; в path и query он запрещен
(правило M-6) — это проверяется отдельным правилом Spectral и скриптом. Открытый токен
возвращается один раз, в ответе на создание бронирования (правило M-4). Ссылку управления
клиент собирает как `<frontend>/#<managementPath>#token=<managementToken>`, чтобы секрет
жил во fragment и не попадал на сервер (правило M-7).

Неверный, отсутствующий или чужой токен и несуществующее бронирование дают один и тот же
ответ `403 BOOKING_TOKEN_INVALID` (правило M-11). Поэтому у операций с токеном нет `404`.

### Идемпотентность

Создание бронирования принимает необязательный `Idempotency-Key` (16–128 символов,
правило B-7). Повтор с тем же ключом и телом возвращает `201` с сохраненным результатом
и заголовком `Idempotency-Replayed: true`; повтор с другим телом — `409 IDEMPOTENCY_KEY_REUSED`.

Отмена идемпотентна по самой природе операции и возвращает `200` со стабильным телом,
включая неизменный `cancelledAt` (правило C-2). `204` для отмены сознательно не используется:
клиенту нужен результат без дополнительного запроса.

### Ошибки

Единое тело [`Error`](../openapi.yaml) со стабильным `code`, `message`, необязательным
массивом `details` (тип `ValidationDetail`), `requestId` и `timestamp`. Тип содержимого —
`application/problem+json`. Клиенты обязаны ветвиться по `code`, а не по тексту.

| Код | HTTP |
| --- | --- |
| `MALFORMED_REQUEST` | 400 |
| `BOOKING_TOKEN_INVALID` | 403 |
| `CALENDAR_NOT_FOUND`, `BOOKING_NOT_FOUND`, `AVAILABILITY_WINDOW_NOT_FOUND` | 404 |
| `SLOT_TAKEN`, `AVAILABILITY_OVERLAP`, `AVAILABILITY_WINDOW_HAS_BOOKINGS`, `IDEMPOTENCY_KEY_REUSED`, `BOOKING_ALREADY_STARTED`, `BOOKING_NOT_RESCHEDULABLE` | 409 |
| `VALIDATION_ERROR` | 422 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |

Разделение `400` и `422`: `400` — запрос нельзя разобрать (битый JSON, отсутствующий
обязательный заголовок или параметр, неверный тип), `422` — запрос разобран, но значения
нарушают продуктовые правила. Backend на этапе 5 обязан переопределить статус по умолчанию
`ValidationPipe` (`400`) на `422`.

Каждый элемент `details` может содержать `rule` — идентификатор продуктового правила
(`B-3`, `S-5`, `A-9` и т. д.) из [`product-requirements.md`](product-requirements.md).
Это делает ошибки трассируемыми до требований и удобными для тестов.

### Закрытость DTO

Все схемы-объекты объявлены с `additionalProperties: false`. Неизвестное поле в теле —
ошибка, а не молча игнорируемые данные. Инвариант проверяется в `npm run lint`.

## 6. Что генерируется из контракта на следующих этапах

- Этап 3: скелет backend с глобальным префиксом `/api/v1` и валидацией, соответствующей контракту.
- Этап 4: типы и клиент frontend в `frontend/src/shared/api/generated/`, разработка на Prism.
- Этап 9: контрактные тесты, сверяющие ответы реализации со схемами контракта.
- Этап 11: `npm run lint` в CI как обязательная проверка.
