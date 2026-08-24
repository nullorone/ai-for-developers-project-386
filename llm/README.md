# Промпты реализации

Комплект предназначен для последовательной реализации проекта ИИ-агентами.

## Как использовать

1. Всегда начинайте с `00-project-overview.md`.
2. Передавайте агенту один файл этапа за раз в порядке нумерации.
3. Агент должен учитывать результаты всех уже завершенных этапов в репозитории.
4. Не переходите дальше, пока критерии приемки текущего этапа не выполнены или ограничения явно не зафиксированы.
5. После каждого этапа просматривайте diff, результаты проверок и запись в `docs/ai-development-log.md`.
6. Изменение продукта сначала отражается в overview/requirements/OpenAPI, а затем в реализации.

## Порядок

1. [Требования](01-requirements.md)
2. [OpenAPI](02-openapi-contract.md)
3. [Каркас](03-project-scaffold.md)
4. [Frontend на mocks](04-frontend-mocks.md)
5. [Основной backend](05-backend-core.md)
6. [Жизненный цикл бронирования](06-booking-lifecycle.md)
7. [RabbitMQ и outbox](07-rabbitmq-outbox.md)
8. [Интеграция](08-frontend-backend-integration.md)
9. [Тестирование](09-testing.md)
10. [Docker и эксплуатация](10-docker-operations.md)
11. [CI/CD](11-ci-cd.md)
12. [Бесплатный деплой](12-free-deployment.md)
13. [Финальная документация](13-final-documentation.md)

