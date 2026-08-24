# Этап 8. Интеграция frontend и backend

## Промпт агенту

Ты — senior full-stack engineer. Подключи готовый frontend к реальному NestJS API без обхода OpenAPI-контракта.

Прочитай overview, OpenAPI, frontend mock implementation, backend implementation и документацию API/messaging. Сначала перегенерируй frontend client из актуального `openapi.yaml` и проверь diff.

## Цель

Все guest и owner сценарии должны работать end-to-end с реальными PostgreSQL и backend; mocks остаются только для тестов и изолированной разработки.

## Выполни

1. Настрой frontend API base URL через типизированную environment configuration.
2. Переведи production code на generated client. Удали временные hardcoded fixtures/fake handlers из runtime path.
3. Настрой backend CORS по allowlist origins через env, включая local frontend и будущий GitHub Pages origin. Не используй wildcard вместе с credentials.
4. Свяжи создание бронирования с `Idempotency-Key`; повтор UI-submit не должен создавать дубль.
5. Реализуй безопасную передачу management token из fragment route в `X-Booking-Token` без попадания в query, логи и persistent storage.
6. После создания, отмены или переноса корректно invalidate/refetch TanStack Query cache.
7. Обработай реальные error codes OpenAPI: validation, unauthorized token, not found, conflict, rate limit и generic failure.
8. Проверь UTC/local conversions для календаря, бронирования, отмены и переноса.
9. Настрой development mode: frontend + реальный API; отдельно документируй mock mode.
10. Добавь integration smoke tests на реальном API минимум для полного guest flow и owner reschedule flow.
11. Исправляй обнаруженные расхождения прежде всего в реализации; контракт меняй только если он действительно ошибочен, с синхронизацией codegen/docs/tests.
12. Обнови README и `docs/ai-development-log.md`.

## Ограничения

- Не импортировать backend types или source files во frontend.
- Не выполнять ручной fetch в обход общего generated client без обоснованного адаптера.
- Не включать mocks в production build.
- Не ослаблять backend validation для удобства frontend.
- Не сохранять management token в local/session storage.

## Критерии приемки

- Guest может увидеть слоты, забронировать и отменить встречу.
- Отмененный слот снова появляется.
- Owner может создать availability, увидеть booking и перенести его.
- Конфликт занятого слота приводит к понятному UI и refresh данных.
- Network payloads соответствуют OpenAPI.
- Production frontend build не содержит mock interception.

## Проверка

- Запусти обе части с тестовой PostgreSQL/RabbitMQ и пройди сценарии.
- Выполни frontend/backend lint, typecheck, tests и build.
- Проверь два timezone окружения браузера.
- Проверь Network/console/storage на утечки token и PII.
- В отчете перечисли найденные расхождения контракта и способ их устранения.

