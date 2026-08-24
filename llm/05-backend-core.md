# Этап 5. PostgreSQL и основной backend

## Промпт агенту

Ты — senior NestJS backend engineer. Реализуй основную доменную модель, доступность, расчет слотов и read endpoints. Не реализовывай пока полноценные команды создания/отмены/переноса и RabbitMQ.

Прочитай overview, требования, OpenAPI, ADR и текущий backend. `openapi.yaml` является контрактом. Если реализация требует изменения контракта, сначала объясни необходимость и обнови все связанные документы и generated client.

## Цель

Получить миграции PostgreSQL, seed-календарь, расчет доступности и основу модулей бронирования, готовую к транзакционным use cases этапа 6.

## Выполни

1. Спроектируй Prisma schema для `Calendar`, `AvailabilityWindow`, `Booking`, `SlotReservation`, `OutboxEvent`, `NotificationLog`.
2. Добавь enum статусов и database constraints/indexes. Где Prisma не выражает важное ограничение, добавь безопасную SQL migration и комментарий с причиной.
3. Создай начальную миграцию и идемпотентный seed одного календаря с фиксированным slug.
4. Реализуй repositories или иной простой persistence boundary, не протаскивая Prisma во все слои.
5. Реализуй calendar read endpoint.
6. Реализуй owner CRUD опубликованных интервалов: список, создание, удаление.
7. Запрети некратные 30 минутам границы, пустые/прошедшие интервалы и пересечения для одного календаря.
8. Реализуй чистый domain service генерации 30-минутных слотов: диапазон, доступность, текущее время и активные reservations.
9. Реализуй публичный slots endpoint и owner read endpoints, которым пока не нужны команды этапа 6.
10. Введи injectable clock, чтобы тесты не зависели от текущей даты.
11. Добавь единый mapper ошибок к формату OpenAPI, validation pipe и безопасное logging policy.
12. Добавь unit-тесты генерации слотов, пересечений, границ диапазона и UTC.
13. Добавь integration tests PostgreSQL для availability и slot queries.
14. Обнови документацию модели/ER diagram и `docs/ai-development-log.md`.

## Ограничения

- Не подключай RabbitMQ и не запускай outbox publisher.
- Не имитируй защиту от гонок проверкой `find` перед `insert`; база должна иметь будущий уникальный инвариант reservation.
- Не рассчитывай время в локальной timezone сервера.
- Не возвращай Prisma entities напрямую из controller.
- Не помещай бизнес-правила в controllers.

## Критерии приемки

- Миграция поднимает чистую PostgreSQL, seed повторяем.
- Пересекающиеся интервалы отвергаются предсказуемой ошибкой.
- Slots endpoint исключает прошлые и занятые интервалы.
- Модель поддерживает будущую отмену и перенос без удаления Booking.
- Реализация read endpoints соответствует OpenAPI.
- Unit и PostgreSQL integration tests проходят детерминированно.

## Проверка

- Подними тестовую PostgreSQL и примени миграции с нуля.
- Запусти seed дважды.
- Запусти backend lint, typecheck, unit/integration tests и build.
- Проверь timezone tests и explain/index usage для основных slot/owner queries в разумном объеме.
- В отчете приложи краткое описание модели и constraints.

