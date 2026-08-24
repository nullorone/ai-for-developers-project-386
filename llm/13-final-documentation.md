# Этап 13. Итоговая LLM-документация и портфолио

## Промпт агенту

Ты — senior engineer и technical writer. Проведи финальный аудит MVP и оформи репозиторий как проверяемый учебный кейс под backend-вакансию. Не добавляй новые продуктовые функции.

Прочитай overview, все файлы этапов `llm/01-*.md` — `llm/12-*.md`, требования, ADR, OpenAPI, код, тесты, CI/CD/deployment docs и накопленный `docs/ai-development-log.md`.

## Цель

Показать законченный продукт, архитектурные компромиссы, надежность и критическое применение LLM, а не просто список технологий.

## Выполни

1. Проведи gap analysis против всех acceptance criteria требований и критериев готовности overview. Исправляй только небольшие дефекты/документацию; крупный незавершенный этап явно обозначь, не маскируй.
2. Перепиши корневой README как входную точку проекта:
   - задача и demo URLs;
   - возможности гостя/владельца;
   - screenshots/GIF placeholders только если реальные assets еще не созданы;
   - стек;
   - компактная архитектурная диаграмма;
   - Design First workflow;
   - быстрый запуск Docker Compose;
   - локальный запуск частей;
   - тесты и CI;
   - API docs;
   - deployment;
   - ограничения MVP и production risks;
   - ключевые инженерные решения.
3. Создай/обнови `docs/architecture.md` с container/component/data-flow diagrams, транзакциями create/cancel/reschedule и RabbitMQ failure flow. Используй Mermaid, если renderer проекта это поддерживает.
4. Создай `docs/llm-workflow.md`:
   - как этапы и промпты использовались;
   - checklist проверки AI-generated changes;
   - примеры полезных итераций без выдумывания фактов;
   - ошибки/риски, обнаруженные человеком или тестами;
   - правила безопасности и работы с секретами;
   - где LLM помог, а где требовалась критическая оценка.
5. Приведи `docs/ai-development-log.md` к единому краткому формату. Не сочиняй отсутствующие запуски, результаты или решения; помечай неизвестное честно.
6. Создай `docs/demo-script.md` на 5–7 минут: availability → booking → conflict → cancellation → rebooking → owner reschedule → Rabbit/outbox evidence → CI.
7. Создай `docs/production-readiness.md` с тем, что обязательно добавить для реального продукта: auth/RBAC, email provider, privacy/retention, audit, backups, observability, SLO, recurring rules и external calendars. Это roadmap, не реализация.
8. Проверь ссылки между всеми документами, команды, env names, URLs и соответствие OpenAPI фактической реализации.
9. Удали устаревшие placeholder-инструкции и дублирование, но сохрани файлы промптов в `llm/` как артефакт процесса.
10. Выполни финальный полный набор проверок.

## Ограничения

- Не заявлять 100% надежность, exactly-once, production-ready или успешный deploy без доказательств.
- Не выдумывать метрики производительности и CI runs.
- Не публиковать реальные guest data, management tokens или secrets в screenshots/docs.
- Не превращать README в длинный учебник; детали вынести в `docs/`.
- Не добавлять Kubernetes/gRPC только для резюме.

## Критерии приемки

- Новый разработчик понимает продукт и запускает его по README.
- Рекрутер за несколько минут видит NestJS, REST, RabbitMQ, транзакции, тесты, Docker, CI/CD и LLM workflow.
- Все ключевые утверждения подтверждаются кодом, тестом, workflow или документом.
- Архитектура отмены/переноса и гарантия от двойного бронирования объяснены понятно.
- Ограничения бесплатного деплоя и отсутствия auth обозначены явно.
- Документация не содержит секретов, битых ссылок и ложных результатов.

## Проверка

- Выполни OpenAPI lint/codegen drift check.
- Выполни frontend и backend lint/typecheck/tests/build.
- Выполни integration/E2E и Docker Compose smoke согласно документации.
- Проверь Markdown links и Mermaid syntax доступными средствами.
- Выполни secret scan и поиск `TODO`, `TBD`, `localhost` в production docs/config.
- В финальном отчете дай таблицу критериев MVP со статусами `готово / ограничено / не готово` и приложи точные команды проверок.

