# Этап 11. CI/CD

## Промпт агенту

Ты — senior DevOps/backend engineer. Создай GitHub Actions pipeline, который проверяет контракт, два независимых приложения, интеграции и Docker images до деплоя.

Прочитай overview, test strategy, operations docs, существующие workflows и package scripts. Не удаляй учебные/платформенные workflows без анализа их назначения.

## Цель

Каждый pull request получает быстрый понятный feedback, а main branch может безопасно собрать и передать проверенные артефакты этапу деплоя.

## Выполни

1. Спроектируй jobs с разумным параллелизмом и dependencies:
   - OpenAPI lint/contract check;
   - frontend lint, typecheck, tests, build;
   - backend lint, typecheck, unit tests, build;
   - PostgreSQL/RabbitMQ integration tests;
   - Playwright smoke/E2E;
   - Docker build для обоих приложений;
   - vulnerability/dependency scan с обоснованной политикой failure.
2. Используй lockfile installs и закрепленные major/commit versions GitHub Actions.
3. Настрой dependency caching по корректным lockfiles каждого независимого каталога.
4. Добавь проверку contract drift: codegen выполняется в CI, неожиданное отличие generated client или несовместимость должны обнаруживаться выбранным способом.
5. Передавай между jobs только необходимые artifacts; добавь retention и понятные имена.
6. Для интеграционных тестов используй service containers или Testcontainers в зависимости от текущей test strategy.
7. Загружай Playwright report и relevant logs при падении, не включая секреты/PII.
8. Добавь concurrency cancellation для устаревших запусков одной ветки.
9. Подготовь отдельный deploy workflow/job, запускаемый только после зеленых checks на main и использующий GitHub Environments/secrets. Сам production deploy реализуется на этапе 12.
10. Добавь Dependabot или эквивалентную минимальную автоматизацию обновлений отдельно для frontend/backend и actions, если это не конфликтует с учебной платформой.
11. Документируй pipeline и required checks в `docs/ci-cd.md`.
12. Обнови badges README только после существования соответствующих workflows.
13. Обнови `docs/ai-development-log.md`.

## Ограничения

- Не хранить секреты в YAML, artifacts или logs.
- Не запускать deploy из pull request/fork.
- Не дублировать полный тяжелый suite во всех jobs без причины.
- Не использовать `continue-on-error` для обязательных quality gates.
- Не ослаблять тесты ради ограничений CI; оптимизировать кэш и разделение jobs.

## Критерии приемки

- Изменение OpenAPI без синхронизации ловится CI.
- Ошибка frontend, backend, integration или E2E блокирует deploy gate.
- Docker images собираются из того же commit.
- Workflow безопасен для pull requests из forks.
- В CI нет production secrets для test jobs.
- Документация объясняет jobs, triggers и диагностику падений.

## Проверка

- Проверь YAML локальным action linter, если доступен.
- Выполни локально команды, которые запускает каждый job.
- Проанализируй permissions каждого workflow и оставь минимально необходимые.
- Если можно безопасно запустить workflow в текущем репозитории — проверь реальный run; внешние действия выполняй только при наличии полномочий пользователя.
- В отчете перечисли required checks и то, что невозможно проверить без GitHub run.

