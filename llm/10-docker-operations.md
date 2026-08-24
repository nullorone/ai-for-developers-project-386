# Этап 10. Docker и эксплуатационная готовность

## Промпт агенту

Ты — senior platform-minded engineer. Контейнеризируй приложение и добавь минимальные production-grade эксплуатационные механизмы без Kubernetes.

Прочитай overview, README, env examples, health/messaging docs и команды сборки обоих приложений. Сохрани раздельные frontend/backend Dockerfiles.

## Цель

Поднять полное эталонное окружение одной Docker Compose командой и получить небольшие безопасные production images.

## Выполни

1. Создай multi-stage `frontend/Dockerfile`: reproducible install, build SPA, lightweight static server с корректным caching/security headers и non-root runtime, если образ позволяет.
2. Создай multi-stage `backend/Dockerfile`: reproducible install, Prisma generate, build, production-only runtime deps, init handling при необходимости, non-root user.
3. Добавь `.dockerignore` для обоих приложений.
4. Создай корневой `docker-compose.yml` для frontend, backend, PostgreSQL и RabbitMQ с management UI только для local development.
5. Добавь named volumes, internal networking, healthchecks, dependency conditions без предположения, что `depends_on` заменяет application retries.
6. Добавь безопасный способ применения Prisma migrations и seed в локальном окружении. Не запускай destructive reset при старте.
7. Настрой frontend runtime/build-time API URL и документируй различие.
8. Улучши backend operations:
   - structured JSON logs;
   - request/correlation id;
   - PII/token redaction;
   - graceful shutdown HTTP/Rabbit/Prisma;
   - liveness/readiness;
   - rate limiting публичных операций;
   - body/range limits.
9. Настрой restart policy и termination behavior разумно для Compose.
10. Проверь image layers на отсутствие `.env`, source secrets и dev-only artifacts.
11. Создай `docs/operations.md`: запуск, миграции, backup assumptions, health, логи, восстановление RabbitMQ/outbox и troubleshooting.
12. Обнови README и `docs/ai-development-log.md`.

## Ограничения

- Не добавлять Kubernetes/Helm.
- Не встраивать секреты через Docker ARG/ENV в image.
- Не публиковать PostgreSQL/RabbitMQ порты наружу в production-like profile без необходимости.
- Не использовать `latest` для инфраструктурных images; закрепить совместимые версии.
- Не выполнять schema push вместо миграций для production flow.

## Критерии приемки

- Чистый `docker compose up --build` поднимает все сервисы после документированных env-шагов.
- Healthchecks становятся healthy, frontend выполняет запросы к backend.
- Бронирование, отмена, перенос и Rabbit notification работают в Compose.
- Restart backend не теряет данные и pending outbox.
- Контейнеры приложений не работают от root.
- Images не содержат секреты и существенно лишние build dependencies.

## Проверка

- Собери images без build cache.
- Подними чистое окружение, примени migration/seed и пройди smoke flows.
- Перезапусти backend и RabbitMQ во время pending event.
- Проверь `docker inspect`, image history, users и health status.
- Запусти доступный image vulnerability scan и зафиксируй существенные findings.
- В отчете укажи image sizes, команды запуска и эксплуатационные ограничения.

