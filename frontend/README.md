# Frontend «Запись на звонок»

React + TypeScript + Vite. Независимый проект: собственные зависимости, lockfile,
скрипты и тесты. Единственная связь с backend — корневой
[`openapi.yaml`](../openapi.yaml), из которого генерируется типизированный API-клиент.

## Требования

- Node.js `>=20.6.0` (проверено на 20.6.1), npm 9+.
- Backend или Prism mock не обязателен для `build` и тестов.

## Быстрый старт

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev          # http://localhost:5173
```

`npm run dev`, `build`, `typecheck` и `test` автоматически выполняют кодогенерацию
из контракта (`pre*`-скрипты), поэтому отдельный шаг не нужен.

## Команды

| Команда | Что делает |
| --- | --- |
| `npm run api:generate` | Генерирует `src/shared/api/generated/schema.d.ts` из `../openapi.yaml` |
| `npm run dev` | Dev-сервер Vite на порту 5173 |
| `npm run build` | `typecheck` + production-сборка в `dist/` |
| `npm start` / `npm run preview` | Локальный просмотр собранного `dist/` на порту 4173 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config), `--max-warnings=0` |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Vitest в watch-режиме; `npm test -- --run` или `npm run test:run` — однократно |

## Переменные окружения

Только `.env.example` хранится в Git; `.env*` игнорируются. Секретов у frontend нет:
любая переменная с префиксом `VITE_` попадает в бандл.

| Переменная | Назначение |
| --- | --- |
| `VITE_API_BASE_URL` | Базовый адрес API. По умолчанию `http://127.0.0.1:4010` (Prism mock, без префикса `/api/v1`); локальный backend — `http://localhost:3000/api/v1` |
| `VITE_BASE_PATH` | `base` сборки Vite. Для GitHub Pages из подкаталога репозитория |

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
├── features/   # пользовательские сценарии (наполняется на этапе 4)
├── entities/   # доменные сущности контракта (наполняется на этапе 4)
└── shared/     # api-клиент, конфигурация, ui-примитивы
tests/          # smoke- и интеграционные тесты уровня приложения
```

`features/` и `entities/` сейчас содержат только описание правил слоя: этап каркаса
не создает пустые барrel-модули и обертки «на будущее».

## Маршрутизация

Используется hash routing (`createHashRouter`): frontend деплоится на GitHub Pages,
где нет server-side fallback на `index.html`, а management token гостя живет
во fragment URL (правило M-7).

## Тесты

Vitest + Testing Library, окружение jsdom. Сейчас покрыты валидация конфигурации,
рендер стартовой страницы, маршрут 404 и сборка типизированного API-клиента.
Сетевые вызовы не выполняются: mock-слой появится на этапе 4.
