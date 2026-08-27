# Frontend «Запись на звонок»

React + TypeScript + Vite. Независимый проект: собственные зависимости, lockfile,
скрипты и тесты. Единственная связь с backend — корневой
[`openapi.yaml`](../openapi.yaml), из которого генерируется типизированный API-клиент.

## Требования

- Node.js `>=20.6.0` (проверено на 20.6.1), npm 9+.
- Backend или Prism mock не обязателен для `build` и тестов.

## Реализованные маршруты

Hash routing совместим с GitHub Pages. После адреса сайта маршруты выглядят так:

| Маршрут                           | Сценарий                                                            |
| --------------------------------- | ------------------------------------------------------------------- |
| `#/calendars/:slug`               | публичный календарь, локальная дата, 30-минутный слот и форма гостя |
| `#/bookings/:id/confirmed`        | подтверждение сразу после создания и management-ссылка              |
| `#/bookings/:id#token=…`          | просмотр и отмена по токену из fragment                             |
| `#/owner/availability`            | создание и удаление интервалов доступности                          |
| `#/owner/bookings`                | список будущих подтвержденных встреч                                |
| `#/owner/bookings/:id/reschedule` | выбор свободного слота и перенос встречи                            |

Management token не записывается в `localStorage`, `sessionStorage`, логи или query/path API.
Он остается в памяти/fragment и передается только заголовком `X-Booking-Token`.

## Быстрый старт на Prism

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev          # http://localhost:5173
```

В другом терминале из корня проекта запустите `npm run mock`. Prism отдает примеры
непосредственно из `openapi.yaml`, поэтому frontend можно пройти без backend. Production build
не требует запущенного Prism.

`npm run dev`, `build`, `typecheck` и `test` автоматически выполняют кодогенерацию
из контракта (`pre*`-скрипты), поэтому отдельный шаг не нужен.

## Команды

| Команда                           | Что делает                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `npm run api:generate`            | Генерирует `src/shared/api/generated/schema.d.ts` из `../openapi.yaml`         |
| `npm run dev`                     | Dev-сервер Vite на порту 5173                                                  |
| `npm run build`                   | `typecheck` + production-сборка в `dist/`                                      |
| `npm start` / `npm run preview`   | Локальный просмотр собранного `dist/` на порту 4173                            |
| `npm run typecheck`               | `tsc --noEmit`                                                                 |
| `npm run lint`                    | ESLint (flat config), `--max-warnings=0`                                       |
| `npm run format` / `format:check` | Prettier                                                                       |
| `npm test`                        | Vitest в watch-режиме; `npm test -- --run` или `npm run test:run` — однократно |

## Переменные окружения

Только `.env.example` хранится в Git; `.env*` игнорируются. Секретов у frontend нет:
любая переменная с префиксом `VITE_` попадает в бандл.

| Переменная          | Назначение                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | Базовый адрес API. По умолчанию `http://127.0.0.1:4010` (Prism mock, без префикса `/api/v1`); локальный backend — `http://localhost:3000/api/v1` |
| `VITE_BASE_PATH`    | `base` сборки Vite. Для GitHub Pages из подкаталога репозитория                                                                                  |

Значения валидируются zod в [`src/shared/config/env.ts`](src/shared/config/env.ts):
неверный URL роняет приложение с понятным сообщением, а не «тихо» ломает запросы.

## Кодогенерация API-клиента

- Генератор: `openapi-typescript` → типы `paths`/`components`.
- Транспорт: `openapi-fetch` в [`src/shared/api/client.ts`](src/shared/api/client.ts).
- Результат кодогенерации **не коммитится** (`.gitignore`) и **не редактируется руками**:
  он детерминированно пересоздается перед `dev`, `typecheck`, `build` и `test`.
- Изменение контракта — только в корневом `openapi.yaml` (ADR 0002).

## Структура

```text
src/
├── app/        # композиция приложения: провайдеры, роутер, layout, глобальные стили
├── pages/      # экраны, привязанные к маршрутам
├── features/   # границы пользовательских сценариев
├── entities/   # доменные сущности контракта
└── shared/     # api-клиент, конфигурация, ui-примитивы
tests/          # smoke- и интеграционные тесты уровня приложения
```

Тонкий адаптер `shared/api/bookingApi.ts` работает поверх `openapi-fetch`; его DTO импортируются
из сгенерированной схемы и не дублируются вручную. Компоненты не знают внутренностей backend.

## Маршрутизация

Используется hash routing (`createHashRouter`): frontend деплоится на GitHub Pages,
где нет server-side fallback на `index.html`, а management token гостя живет
во fragment URL (правило M-7).

## Состояния и тестовый mock layer

Каждый экран показывает loading, empty/validation, server error и success там, где состояние
применимо. Конфликты создания и переноса обновляют слоты; до успешного ответа исходная встреча
не меняется. Ошибки имеют `role=alert`, фоновые обновления — `role=status`, после результата
фокус переносится на сообщение. Нативные radio/date/datetime-local сохраняют keyboard navigation.

`tests/mockApi.ts` — stateful contract-aligned mock layer: fixture-объекты типизированы напрямую
сгенерированными OpenAPI DTO. Флаги `emptySlots`, `failCalendar`, `conflictNextBooking` и
`conflictNextReschedule` воспроизводят ключевые состояния. Testing Library покрывает guest happy
path, `409`, отмену, owner CRUD и сохранение исходной встречи после неуспешного переноса.
Отдельные timezone-тесты проверяют один UTC-момент в `Europe/Moscow` и `America/New_York`.

Статический Prism smoke всего контракта запускается из корня: `npm run smoke:mock`.

## Визуальные ограничения

- Выбор даты намеренно использует нативный browser date picker без тяжелой календарной библиотеки;
  внешний вид немного отличается между браузерами.
- Нет дизайн-системы и автоматических screenshot/visual-regression тестов; проверены базовая
  адаптивность, контрастные состояния фокуса и узкий одноколоночный layout.
