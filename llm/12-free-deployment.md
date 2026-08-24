# Этап 12. Бесплатный деплой

## Промпт агенту

Ты — senior deployment engineer. Подготовь и, при наличии явных полномочий и секретов пользователя, выполни бесплатный учебный деплой: frontend на GitHub Pages, backend/PostgreSQL/RabbitMQ на актуальных подходящих managed-платформах.

Прочитай overview, operations и CI/CD docs, Dockerfiles, workflows и env examples. Перед выбором backend/database/broker проверь актуальные на момент выполнения условия бесплатных тарифов только по официальным источникам. Не считай старые сведения о Render, Koyeb, Neon, Supabase или CloudAMQP гарантированно актуальными.

## Цель

Получить публичный frontend и доступный API либо полностью готовую к запуску конфигурацию, если для внешнего деплоя не предоставлены учетные данные.

## Выполни

1. Составь короткую сравнительную таблицу актуальных вариантов:
   - поддержка долгоживущего Node/NestJS-процесса;
   - sleep/cold start;
   - outbound TCP/TLS к RabbitMQ/PostgreSQL;
   - persistent worker/consumer ограничения;
   - лимиты бесплатного тарифа;
   - требования карты/кредитов;
   - срок действия бесплатности.
2. Выбери минимальную схему и зафиксируй ADR. Приоритет: один backend service с HTTP + embedded outbox publisher/consumer, managed PostgreSQL, managed RabbitMQ.
3. Настрой GitHub Pages deployment frontend:
   - корректный Vite base path для repository pages;
   - hash routing;
   - production API URL;
   - deploy только из проверенного main artifact.
4. Добавь provider config/manifest для backend, если платформа его поддерживает, без секретов.
5. Подготовь production env matrix: имя переменной, сервис, обязательность и источник значения. Значения секретов не документируй.
6. Настрой безопасное применение миграций отдельным release/predeploy шагом. Seed production выполняй только осознанно и идемпотентно.
7. Настрой CORS на точный GitHub Pages origin.
8. После деплоя выполни smoke tests: health, calendar, slots, booking, cancellation, reschedule и асинхронный NotificationLog доступным безопасным способом.
9. Проверь cold start и поведение outbox/consumer после сна или рестарта бесплатного backend.
10. Не используй cron/ping keep-alive для обхода ограничений бесплатного тарифа.
11. Создай `docs/deployment.md` с URLs, пошаговой настройкой, rollback, миграциями, ограничениями и оценкой того, какие части полного Compose-окружения недоступны в облаке.
12. Добавь production smoke script, который не создает бесконтрольные данные и не печатает секреты.
13. Обнови README и `docs/ai-development-log.md`.

## Правила внешних действий

- Не создавай аккаунты, проекты, базы, брокеры, DNS или GitHub secrets без явной авторизации пользователя.
- Если credentials отсутствуют, полностью подготовь конфигурацию и остановись с точным checklist ручных действий.
- Не проси пользователя публиковать секреты в чат или commit; укажи безопасное место их добавления.
- Не удаляй облачные ресурсы и не выполняй destructive migration.

## Критерии приемки

- Frontend production build корректно работает под GitHub Pages subpath.
- API URL и CORS настроены без wildcard.
- Backend использует managed PostgreSQL/RabbitMQ по TLS, если провайдеры поддерживают/требуют это.
- Migration flow отделен от обычного старта приложения.
- Документация честно описывает sleep/cold start и влияние на RabbitMQ consumer.
- Локальный Docker Compose остается эталонным полным окружением.
- Ни одного секрета нет в Git или logs.

## Проверка

- Запусти production builds и проверь Pages artifact локально с правильным base path.
- Проверь provider config валидатором или dry run, если доступно.
- При выполненном деплое запусти smoke script и приложи результаты без секретов.
- Выполни secret scan repository/history в доступном объеме.
- В отчете дай публичные URL либо точный blocker/checklist, а также ссылки на официальные условия выбранных тарифов.

