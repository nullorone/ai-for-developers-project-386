# Этап 3. Каркас frontend и backend

## Промпт агенту

Ты — senior full-stack engineer. Создай минимальный рабочий каркас двух независимых приложений, не реализуя продуктовые use cases.

Прочитай `llm/00-project-overview.md`, требования, `openapi.yaml`, `docs/api.md` и ADR. Изучи текущие версии Node/package manager в окружении. Используй стабильные совместимые версии зависимостей и зафиксируй ожидаемую версию Node.

## Цель

Получить независимо запускаемые `frontend/` и `backend/`, базовые проверки качества и воспроизводимое окружение разработки.

## Выполни

1. Создай `frontend/` на React + TypeScript + Vite.
2. Подключи React Router, TanStack Query, React Hook Form и выбранную библиотеку schema validation.
3. Подготовь слои `app`, `pages`, `features`, `entities`, `shared`, но не создавай пустую многоуровневую абстракцию без использования.
4. Создай `backend/` на NestJS + TypeScript.
5. Подключи Prisma, PostgreSQL driver, config validation, request validation и заготовки модулей из overview без бизнес-логики.
6. Создай `GET /health` с минимальным ответом по контракту.
7. Настрой для каждого приложения собственные `package.json`, lockfile, lint, format, typecheck, test, build и start scripts.
8. Настрой генерацию frontend API-клиента из `../openapi.yaml` в `frontend/src/shared/api/generated/`. Сгенерированный код не редактируется вручную.
9. Добавь `.env.example` отдельно для frontend и backend; реальные `.env` должны игнорироваться Git.
10. Добавь базовые unit/smoke tests для обоих приложений.
11. Обнови корневой README инструкциями локального запуска без Docker.
12. Обнови `docs/ai-development-log.md`.

## Ограничения

- Не создавай npm/pnpm/yarn workspace в корне.
- Не переносить shared runtime code между frontend и backend.
- Не реализовывай доступность, слоты, бронирование, RabbitMQ или Docker.
- Не генерируй OpenAPI из NestJS decorators вместо корневого контракта.
- Не коммить generated artifacts, если выбранный проектный подход надежно генерирует их перед build; решение зафиксируй в README.

## Критерии приемки

- `frontend` и `backend` устанавливаются и собираются независимо.
- Frontend открывается и показывает нейтральную стартовую страницу.
- Backend отвечает на health endpoint.
- API client воспроизводимо генерируется из корневого контракта.
- Lint, typecheck и smoke tests работают отдельно в обоих каталогах.
- В репозитории нет секретов и случайных build artifacts.

## Проверка

Выполни эквиваленты:

```bash
cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build
cd backend && npm run lint && npm run typecheck && npm test && npm run build
```

Также проверь команду codegen и соответствие текущему `openapi.yaml`. В отчете укажи точные команды и версии runtime.

