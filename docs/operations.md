# Эксплуатация без Kubernetes

Эталонное окружение запускается Docker Compose и включает статический frontend, NestJS API,
PostgreSQL 16 и RabbitMQ 3.13. PostgreSQL и AMQP не публикуются на host; наружу на loopback
доступны только приложение (`8080`) и локальная RabbitMQ management UI (`15672`).

## Запуск и остановка

```bash
cp .env.compose.example .env
# Для любого неучебного окружения обязательно замените ключ и пароли:
openssl rand -hex 32
docker compose up --build
```

За TLS-inspecting proxy можно задать публичный URL trusted npm mirror как `NPM_REGISTRY`, а путь
к PEM CA — как `NPM_CA_FILE` в `.env`. Если mirror требует authentication, задайте путь к private
npm config как `NPM_CONFIG_FILE`. CA и `.npmrc` передаются только BuildKit secret mounts и не
попадают в layer/history. Не помещайте registry auth token непосредственно в `.env` или build args.

Откройте <http://localhost:8080>. Readiness API: <http://localhost:8080/api/v1/health/ready>.
RabbitMQ UI для локальной диагностики: <http://localhost:15672>. Все published ports привязаны
к `127.0.0.1`; management port нужно убрать из production override.

`migrate` выполняет только `prisma migrate deploy`, затем `seed` идемпотентно создает demo
calendar. Backend стартует после успешного завершения обоих one-shot контейнеров. Никакие
`db push`, `migrate reset` или destructive startup actions не выполняются. Повторное безопасное
применение:

```bash
docker compose run --rm migrate run prisma:migrate
docker compose run --rm seed run prisma:seed
```

Остановка посылает `SIGTERM`; Compose дает backend/PostgreSQL/RabbitMQ 30 секунд. Nest закрывает
HTTP, consumer/publisher, RabbitMQ connection и Prisma pool через lifecycle hooks. `init: true`
обеспечивает корректную обработку и reaping процессов. Обычная остановка сохраняет named volumes:

```bash
docker compose down
```

`docker compose down --volumes` необратимо удаляет локальные данные и не является штатной
операционной командой.

## Конфигурация frontend

`VITE_API_BASE_URL` — build-time публичное значение, встраиваемое Vite в bundle. Оно подходит
для immutable deployment и не может быть секретом. Docker image собирается с `/api/v1`.

`API_BASE_URL` — runtime значение контейнера. Entry point генерирует non-cacheable `/config.js`,
и оно имеет приоритет над build-time значением. По умолчанию используется same-origin `/api/v1`,
который nginx проксирует в `backend:3000`; поэтому browser не знает внутреннего DNS Compose и CORS
не нужен. Допустим абсолютный `http(s)` URL, например:

```bash
API_BASE_URL=https://api.example.org/api/v1 docker compose up --build frontend
```

Все `VITE_*` значения публичны. Секреты нельзя передавать ни через Docker build args, ни через
frontend environment.

## Health, logs и ограничения

- `/api/v1/health/live` проверяет только живость процесса и всегда отвечает `200` после старта.
- `/api/v1/health/ready` проверяет PostgreSQL и, если messaging включен, RabbitMQ; сбой дает `503`.
- Frontend `/healthz` проверяет nginx без зависимости от API.
- Docker healthcheck backend использует readiness, frontend — `/healthz`.

Backend пишет по одной JSON-записи на строку. Access log содержит timestamp, request id, method,
path без query, status и duration. Headers, body и query не логируются; logger рекурсивно скрывает
credential/token/PII keys, email, Bearer values и credentials в AMQP/PostgreSQL URL. Смотреть логи:

```bash
docker compose logs -f --no-log-prefix backend
```

Booking и все фактически публичные owner endpoints ограничены in-memory лимитом 30 запросов в
минуту на IP/route/process. При нескольких replicas нужен общий limiter (Redis/gateway). JSON/form
body ограничен `HTTP_BODY_LIMIT=64kb`; slot query не может охватывать более 31 дня, availability —
более 14 дней, booking horizon — 90 дней. Nginx ограничивает тело 1 MB до проксирования.

## Backup и восстановление

Source of truth — PostgreSQL. Минимальная политика: согласованный `pg_dump -Fc` перед migration,
шифрованное внешнее хранилище, регулярная проверка restore и retention по требованиям среды.
Пример локального логического backup (файл создается на host):

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > booking.dump
```

Restore выполняют только в пустую совместимую PostgreSQL после остановки backend, затем запускают
`migrate`, проверяют readiness и только потом возвращают трафик. Пароли и encryption key должны
восстанавливаться из внешнего secret store отдельно; потеря idempotency encryption key делает
старые зашифрованные replay responses нечитаемыми.

RabbitMQ volume сохраняет durable queues/messages, но broker не является source of truth.
`PENDING` outbox rows остаются в PostgreSQL и автоматически публикуются после восстановления
RabbitMQ. При потере Rabbit volume приложение заново объявит topology, а pending/leased events
вернутся в публикацию после `OUTBOX_CLAIM_LEASE_MS`. Для `PUBLISHED` events автоматического replay
нет: решение принимается по `NotificationLog` и аудиту. DLQ replay выполняется по процедуре из
[`messaging.md`](messaging.md), сохраняя `eventId`; сначала создайте backup очереди и ограничьте
скорость.

## Диагностика и проверка images

```bash
docker compose ps
docker compose exec backend node -e "console.log(process.getuid())"
docker compose exec frontend id
docker inspect --format '{{.Config.User}}' booking-call-backend booking-call-frontend
docker history --no-trunc booking-call-backend
docker image ls booking-call-backend booking-call-frontend
```

Если backend не ready, сначала проверьте `postgres`/`rabbitmq` health и JSON logs. Если `migrate`
завершился с ошибкой, не обходите migration через schema push: исправьте connectivity/SQL и
повторите one-shot сервис. При росте outbox проверьте broker readiness, publisher confirms и lease.
При DLQ исправьте первопричину до replay. При `429` соблюдайте `Retry-After`.

Images используют pinned base tags, multi-stage build и non-root users. Runtime backend не содержит
Prisma CLI, TypeScript, Nest CLI или исходники; frontend содержит только SPA/nginx. `.dockerignore`
исключает `.env*`, VCS, tests, reports и local dependencies. Перед release следует выполнить
доступный Trivy/Docker Scout scan; findings базового OS/runtime фиксируются вместе с digest, потому
что tag со временем может быть пересобран.

Измерение reference build 2026-08-30 (Docker Desktop arm64): backend `90,681,018` bytes
(≈86.5 MiB), frontend `21,977,821` bytes (≈21.0 MiB). `Config.User`: `node` и `101:101`;
effective UID: `1000` и `101`. Docker Scout v1.18.3 был запущен для обоих images, но локальная
установка потребовала Docker ID и не выдала CVE database/results. Это не считается пройденным
security gate: scan нужно повторить в CI с Trivy или аутентифицированным Scout.

## Production assumptions

Compose — single-host reference, не HA orchestration. Production override должен убрать RabbitMQ
management port, использовать external secrets, TLS/reverse proxy, external backup monitoring и
managed/реплицируемые PostgreSQL/RabbitMQ по требуемым RPO/RTO. Owner API в MVP не имеет auth и
неприемлем для публичного production; rate limit не заменяет authentication/authorization.
