# Журнал LLM-разработки

Журнал фиксирует, как этапы проекта выполнялись с участием LLM-агента: задача, подход, проверки, результаты и обнаруженные риски. Порядок этапов — из [`llm/README.md`](../llm/README.md).

## Этап 1. Требования и продуктовые правила

- Дата: 2026-08-26
- Роль агента: senior product-minded backend engineer и аналитик
- Промпт этапа: [`llm/01-requirements.md`](../llm/01-requirements.md)

### Задача

Зафиксировать продуктовые требования компактного MVP «Запись на звонок» до начала реализации так, чтобы frontend и backend можно было разрабатывать независимо по будущему OpenAPI-контракту. Application code не пишется.

### Подход

1. Прочитаны `llm/00-project-overview.md`, `llm/01-requirements.md`, корневой `README.md` и каталог `docs/` (был пуст, кроме созданного `adr/`). Дополнительно просмотрены промпты этапов 2, 4, 5 и 6, чтобы не залезть в их зону ответственности и не противоречить будущим решениям.
2. Scope взят строго из overview: ничего не добавлено и не убрано; non-goals выписаны явным списком.
3. Для каждой user story сформулированы проверяемые acceptance criteria в формате Given/When/Then, включая конкурентные и повторные запросы.
4. Введена нумерация правил (A-, S-, B-, C-, R-, T-, M-, N-, Y-, K-) для ссылок из OpenAPI, тестов и кода.
5. Все числовые лимиты выбраны с письменным обоснованием и оставлены умеренными для MVP.
6. Решения уровня архитектуры вынесены в ADR 0001; технические детали, относящиеся к этапам 2 и далее, вынесены в отдельный раздел «оставлено технической реализации».

### Созданные файлы

- `docs/product-requirements.md`
- `docs/adr/0001-mvp-scope-and-architecture.md`
- `docs/ai-development-log.md`

### Ключевые принятые решения

- Длительность слота 30 минут, границы кратны 30 минутам в UTC; интервалы времени трактуются как полуинтервалы `[start, end)`.
- Минимальный лид-тайм до встречи — 60 минут; горизонт бронирования — 90 дней.
- Запрос слотов: обязательные UTC-границы, максимум 31 день, `from >= now - 1 день`, `to <= now + 90 дней`, отбор по `slot.start ∈ [from, to)`, без пагинации.
- Ограничения доступности: длина интервала до 14 дней, до 500 интервалов на календарь, смежные интервалы разрешены, пересечения запрещены.
- Удаление интервала запрещено, если он пересекается с будущим подтвержденным бронированием.
- Статусов ровно два: `CONFIRMED` и `CANCELLED`; перенос статус не меняет; `CANCELLED` терминален.
- Отмена доступна только по management token, только для будущей встречи, идемпотентна и не порождает повторных событий.
- Перенос атомарен: при конфликте транзакция откатывается целиком, старая встреча и ее слот сохраняются; перенос на то же время — успешная операция без изменений и без события.
- Идемпотентность создания: ключ 16–128 символов, TTL 24 часа, тот же ключ с другим телом — конфликт; повтор возвращает management token, для чего допускается защищенное краткоживущее хранение ответа.
- Management token: не менее 128 бит энтропии, в базе только SHA-256-хеш, передача только в `X-Booking-Token`, хранение на клиенте только в памяти и во fragment URL, единый неразличимый ответ при неверном токене.
- Время: только RFC 3339 UTC с суффиксом `Z`, смещения кроме `Z` отклоняются; часовой пояс владельца информационный; серверное время — источник истины.
- Owner-ответы не содержат комментарий гостя, email маскируется.
- Ограничения частоты: 60/мин чтение, 10/час и 3/мин создание, 20/мин операции с токеном, 30/мин owner-команды.

### Выполненные проверки

- Проверка структуры Markdown: парность и закрытость блоков кода, корректность таблиц.
- Проверка внутренних ссылок: все относительные ссылки в созданных документах указывают на существующие файлы.
- Поиск маркеров незакрытых решений (заглушки вида «сделать позже», «уточнить») в `docs/` — совпадений нет; открытые вопросы явно перечислены в разделе 15 требований и отнесены к технической реализации.
- Сверка каждого утверждения с `llm/00-project-overview.md`: противоречий не найдено, scope не расширен.

### Обнаруженные риски

- Публичный owner-интерфейс без авторизации — критичное для production ограничение; смягчается ограничением частоты запросов и сокращением персональных данных в ответах, обязательно к описанию в README.
- Возврат management token в идемпотентном повторе требует краткоживущего защищенного хранения ответа; механизм выбирается на этапе 6 и не должен приводить к бессрочному хранению открытого секрета.
- Отсутствие мягкого резерва слота делает конфликт на отправке формы нормальным сценарием; интерфейс обязан его корректно обрабатывать.
- Ответ на слоты может содержать до 1488 элементов при максимальном диапазоне; если лимиты вырастут, потребуется отдельное решение о пагинации.
- Бесплатное окружение: холодный старт и возможные паузы в работе consumer влияют на метрики задержки outbox.

### Следующий этап

Этап 2 — OpenAPI-контракт ([`llm/02-openapi-contract.md`](../llm/02-openapi-contract.md)).

## Этап 2. OpenAPI-контракт

- Дата: 2026-08-26
- Роль агента: API architect
- Промпт этапа: [`llm/02-openapi-contract.md`](../llm/02-openapi-contract.md)

### Задача

Создать валидный корневой `openapi.yaml` (OpenAPI 3.1), достаточный для независимой
генерации mock API, клиента frontend и реализации backend, добавить воспроизводимые
команды lint и mock. Application code не пишется.

### Подход

1. Прочитаны `llm/00-project-overview.md`, `docs/product-requirements.md`, ADR 0001 и
   текущее состояние репозитория. Противоречий между overview и требованиями этапа 1
   не обнаружено, поэтому остановка и эскалация не потребовались.
2. Контракт написан вручную, от продуктовых правил: каждое описание операции и схемы
   ссылается на идентификаторы правил (`A-`, `S-`, `B-`, `C-`, `R-`, `T-`, `M-`, `N-`),
   чтобы контракт нельзя было прочитать в отрыве от требований.
3. Набор endpoints взят строго из раздела 8 overview, ничего не добавлено, кроме
   разделения health на `live`/`ready`, которое overview прямо допускает.
4. Статусы и коды ошибок спроектированы как закрытый enum с однозначным соответствием
   HTTP-статусу; неоднозначные места (`401` против `403`, `400` против `422`, `200`
   против `204`) вынесены в ADR 0002 с обоснованием.
5. Инварианты контракта закреплены машинно: регулярные выражения для UTC и 30-минутной
   сетки, `maxItems` по продуктовым лимитам, `additionalProperties: false` во всех схемах,
   `const` для фиксированных значений (30 минут, 60 минут, 90 дней, 500 интервалов).
6. Ruleset Spectral расширен проектными правилами, чтобы ревью не отвечало за то, что
   можно проверить автоматически: запрет токена в path/query, обязательный `X-Request-Id`,
   обязательный `500`, `problem+json` у ошибок, закрытость схем, camelCase у `operationId`.
7. Тулинг положен в корневой `package.json` без поля `workspaces`: требование ADR 0001
   об отсутствии общего workspace сохранено, `frontend/` и `backend/` останутся
   независимыми проектами.

### Созданные и измененные файлы

- `openapi.yaml` (создан)
- `.spectral.yaml` (создан)
- `package.json`, `package-lock.json` (созданы, только contract tooling)
- `scripts/check-operation-ids.mjs` (создан)
- `scripts/smoke-mock.mjs` (создан)
- `docs/api.md` (создан)
- `docs/adr/0002-api-contract-decisions.md` (создан)
- `docs/ai-development-log.md` (обновлен)
- `.gitignore` (обновлен: `node_modules/`, `dist/`, `coverage/`, `*.log`)

### Ключевые принятые решения

- Версионирование базовым путем `/api/v1`; пути операций совпадают с overview.
- Неверный management token — `403 BOOKING_TOKEN_INVALID`, неотличимо от несуществующего
  бронирования; `404` у операций с токеном отсутствует намеренно (правило M-11).
- `400 MALFORMED_REQUEST` для неразбираемого запроса, `422 VALIDATION_ERROR` для нарушения
  продуктовых правил; backend обязан переключить `ValidationPipe` с `400` на `422`.
- Единое тело ошибки `application/problem+json` с закрытым enum `code`, массивом `details`
  и полем `rule`, ссылающимся на идентификатор продуктового правила.
- Отмена возвращает `200` с телом (стабильный идемпотентный результат), `204` — только
  у удаления интервала доступности.
- Идемпотентный повтор создания возвращает `201` с сохраненным результатом и заголовком
  `Idempotency-Replayed: true`.
- Пагинации нет ни в одном списке; размеры ограничены `maxItems` по правилам S-8, A-8.
- Owner-эндпоинты не принимают идентификатор календаря: календарь один (правило A-1),
  но `calendarId` присутствует в ответах.
- Клиент передает только `startsAt`; `endsAt` и длительность вычисляет сервер.
- Все схемы-объекты закрыты `additionalProperties: false`.

### Выполненные проверки

- `npm run lint:openapi` — Spectral с расширенным ruleset, `--fail-severity warn`:
  0 problems. Проверено, что кастомные правила действительно срабатывают: на намеренно
  испорченной копии контракта Spectral выдал `operation-operationId-unique` (error)
  и `every-operation-has-500` (warning).
- `npm run lint:operation-ids` — 14 уникальных `operationId`, 28 схем; отдельно проверено
  отсутствие токена в path/query и шаблонах путей, а также закрытость всех схем-объектов.
- `npm run smoke:mock` — Prism поднят на `127.0.0.1:4010`, пройдено 24 проверки:
  все happy path гостя и владельца (включая календарь, слоты и создание бронирования),
  ключевые ошибки `404/422/409×4/403/429/500/503` и две проверки валидации запроса самим
  контрактом (отсутствующий `X-Booking-Token` → `400`, неизвестное поле в теле → `422`).

### Обнаруженные риски

- Prism отбрасывает базовый путь сервера и обслуживает mock от корня, поэтому адреса
  mock и боевого backend различаются префиксом `/api/v1`. Клиент обязан брать базовый URL
  из переменной окружения; это описано в `docs/api.md`.
- `@stoplight/prism-cli@5.14.2` транзитивно подтягивает ESM-версию `@faker-js/faker`,
  несовместимую с Node 20.6 (`ERR_REQUIRE_ESM`). Зафиксировано через `overrides` на
  `@stoplight/prism-http@5.12.0` и `@stoplight/prism-http-server@5.12.0`; на этапе CI
  нужно либо сохранить override, либо поднять Node до 22 и снять его.
- Контракт задает поведение, отличное от умолчаний NestJS в двух местах (префикс и `422`).
  Если этап 5 это упустит, расхождение проявится только в контрактных тестах этапа 9,
  поэтому оба пункта явно вынесены в `docs/api.md` и ADR 0002.
- Возврат management token в идемпотентном повторе закреплен уже в контракте, а механизм
  защищенного краткоживущего хранения ответа по-прежнему выбирается на этапе 6.
- Owner-эндпоинты публичны; контракт этого не скрывает, но и не защищает — ограничение
  должно быть описано в README на ближайшем этапе, где README обновляется.

### Осознанные отклонения и уточнения относительно промпта

- Пагинация не введена: правило S-8 требований прямо запрещает ее в MVP. Промпт допускал
  ее «при необходимости»; необходимости нет, лимиты закреплены через `maxItems`.
- Для неверного токена выбран `403` из двух допустимых промптом вариантов (`401` или `403`);
  обоснование — в ADR 0002.
- `GET /health` дополнен `/health/live` и `/health/ready`: overview прямо допускает
  разделение, а правило N-18 его требует.

### Следующий этап

Этап 3 — каркас frontend и backend ([`llm/03-project-scaffold.md`](../llm/03-project-scaffold.md)).

## Этап 3. Каркас frontend и backend

- Дата: 2026-08-26
- Роль агента: senior full-stack engineer
- Промпт этапа: [`llm/03-project-scaffold.md`](../llm/03-project-scaffold.md)

### Задача

Создать минимальный рабочий каркас двух независимых приложений — `frontend/` и
`backend/` — с базовыми проверками качества и воспроизводимым локальным запуском.
Продуктовые use cases не реализуются.

### Подход

1. Прочитаны `llm/00-project-overview.md`, `docs/product-requirements.md`, `openapi.yaml`,
   `docs/api.md`, ADR 0001 и 0002, а также промпты этапов 4 и 5, чтобы не залезть
   в их зону ответственности.
2. Изучено окружение: Node **20.6.1**, npm **9.8.1**, других менеджеров пакетов нет.
   Версии зависимостей подобраны под этот runtime: Vite 6 (Vite 7 требует Node 20.19+),
   Vitest 3, React 18, NestJS 11, Prisma 6, TypeScript 5.6.
3. Корневой `package.json` не тронут как источник workspace: поля `workspaces` нет,
   у каждого приложения свой `package.json` и свой lockfile (ADR 0001).
4. Контракт закреплен в коде каркаса там, где умолчания фреймворка ему противоречат:
   глобальный префикс `/api/v1`, `422` вместо `400` у `ValidationPipe`,
   `forbidNonWhitelisted` под `additionalProperties: false`, единый формат ошибки
   `application/problem+json`, обязательный `X-Request-Id`.
5. Слои frontend созданы только там, где есть реальный код. `features/` и `entities/`
   содержат описание правил слоя, а не пустые барrel-модули: промпт прямо запрещает
   многоуровневую абстракцию без использования.
6. Заготовки backend-модулей взяты строго из раздела 3 overview и зарегистрированы
   в `AppModule` без контроллеров и провайдеров.

### Созданные и измененные файлы

- `frontend/` (создан): `package.json`, `package-lock.json`, `tsconfig.json`,
  `vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`,
  `.gitignore`, `.env.example`, `README.md`, `index.html`,
  `src/main.tsx`, `src/app/{App.tsx,AppLayout.tsx,router.tsx,providers/*,styles/global.css}`,
  `src/pages/{home,not-found}/*`, `src/shared/api/{client.ts,generated/README.md}`,
  `src/shared/config/{env.ts,env.test.ts}`, `src/{features,entities}/README.md`,
  `src/shared/ui/README.md`, `tests/{setup.ts,app.smoke.test.tsx,router.test.tsx}`.
- `backend/` (создан): `package.json`, `package-lock.json`, `tsconfig.json`,
  `tsconfig.build.json`, `nest-cli.json`, `jest.config.js`, `eslint.config.mjs`,
  `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.env.example`, `README.md`,
  `prisma/schema.prisma`, `src/{main.ts,bootstrap.ts,app.module.ts}`,
  `src/common/{contract.ts,contract.spec.ts}`,
  `src/common/config/{env.schema.ts,env.schema.spec.ts,logging.ts}`,
  `src/common/errors/contract.exception.ts`,
  `src/common/filters/contract-exception.filter.ts`,
  `src/common/middleware/request-id.middleware.ts`,
  `src/common/validation/{validation.pipe.ts,validation.pipe.spec.ts}`,
  `src/prisma/{prisma.module.ts,prisma.service.ts}`,
  `src/health/{health.module.ts,health.controller.ts,health.service.ts,health.service.spec.ts}`,
  `src/{calendars,availability,slots,bookings,owner,messaging,notifications}/*.module.ts`,
  `test/{setup-env.ts,health.e2e-spec.ts}`.
- `README.md` (переписан: локальный запуск без Docker, порты, проверки, ограничения MVP).
- `.gitignore` (обновлен: `.env.*` с исключением `.env.example`, `*.tsbuildinfo`, `build/`, `.vite/`).
- `docs/ai-development-log.md` (обновлен).

### Ключевые принятые решения

- Ожидаемая версия Node зафиксирована как `>=20.6.0` в `engines` обоих проектов;
  проверено на 20.6.1. Vite 7 и ESLint-совместимость с Node 20.19+ сознательно не берутся.
- Кодогенерация frontend: `openapi-typescript` (типы) + `openapi-fetch` (транспорт).
  Результат в `src/shared/api/generated/` **не коммитится**: генерация детерминирована,
  не требует сети и запускается `pre*`-скриптами перед `dev`, `typecheck`, `test`, `build`.
  Решение зафиксировано в корневом README и в README frontend.
- Prisma Client генерируется `postinstall` и живет в `node_modules`; `schema.prisma`
  содержит только `generator` и `datasource`. Отдельный пакет `pg` не добавлен:
  Prisma работает через собственный движок запросов.
- Соединение Prisma ленивое: `$connect` не вызывается в `onModuleInit`, поэтому backend
  поднимается без PostgreSQL и честно сообщает `503` на `/health` и `/health/ready`.
- Маршрутизация frontend — hash routing (`createHashRouter`) сразу: GitHub Pages
  не дает server-side fallback, а management token живет во fragment (правило M-7).
- Настройка приложения вынесена в `backend/src/bootstrap.ts` и переиспользуется
  в `main.ts` и e2e-тестах: тесты проверяют ровно ту конфигурацию, что уходит в production.
- Валидация окружения на обеих сторонах — zod. Backend валидирует дважды:
  в `main.ts` до создания приложения (быстрое падение) и в `ConfigModule.forRoot`.
- Обращение к маршруту вне контракта отдает `404` с телом `Error` и кодом
  `MALFORMED_REQUEST`: универсального «не найдено» в закрытом enum контракта нет,
  а такой запрос по смыслу неразбираем. Решение помечено комментарием в фильтре.
- Lint у обоих проектов запускается с `--max-warnings=0`, backend — с типизированными
  правилами `typescript-eslint`.

### Выполненные проверки

Runtime: Node **v20.6.1**, npm **9.8.1**.

```bash
cd frontend && npm install && npm run lint && npm run typecheck && npm test -- --run && npm run build
cd backend  && npm install && npm run lint && npm run typecheck && npm test && npm run build
```

- frontend: lint — 0 проблем; typecheck — 0 ошибок; Vitest — 7 тестов в 3 файлах,
  все зеленые; build — `dist/` собран (293.92 kB / 89.36 kB gzip).
- backend: lint — 0 проблем; typecheck — 0 ошибок; Jest — 20 тестов в 5 файлах,
  все зеленые; `nest build` — `dist/` собран.
- Кодогенерация: `cd frontend && npm run api:generate` воспроизводимо создает
  `src/shared/api/generated/schema.d.ts` (openapi-typescript 7.13.0) из текущего
  `../openapi.yaml`; типизированный клиент собирается и проверяется тестом.
- Ручная проверка запуска backend (`node dist/main.js`, `PORT=3111`):
  `GET /api/v1/health/live` → `200` с `HealthStatus`;
  `GET /api/v1/health` → `503` (PostgreSQL не поднят) — ожидаемая ветка контракта;
  `GET /api/v1/nope` → `404` с `Content-Type: application/problem+json`;
  во всех ответах присутствует `X-Request-Id`, заголовка `X-Powered-By` нет.
- Ручная проверка frontend (`npm start`, порт 4199): `index.html` и ассеты отдаются,
  стартовая страница нейтральная.
- Проверено отсутствие секретов и артефактов сборки в индексе Git: `dist/`, `coverage/`,
  `node_modules/`, `.env*` (кроме `.env.example`) и сгенерированный API-клиент игнорируются.

### Обнаруженные риски

- Node 20.6.1 в окружении ниже, чем `engines` части dev-зависимостей
  (ESLint 9 и typescript-eslint требуют `^20.9.0`), — npm выдает предупреждения
  `EBADENGINE`. Фактически инструменты работают, проверки зеленые, но на этапе CI
  корректнее закрепить Node 20.19+ или 22 LTS и снять расхождение.
- `npm audit` в `backend/` показывает 3 high-уязвимости в транзитивной зависимости
  `deepmerge-ts` через `@prisma/config` (dev-зависимость `prisma`, в runtime не попадает).
  Обновление до Prisma 7 отложено: на этапе 5 проектируется схема, менять мажор
  одновременно с этим рискованно. Вопрос вынесен на этап 11 (CI) как обязательный.
- Проверка базы в `/health/ready` пока формальная: `PrismaService.isReachable()`
  выполняет `SELECT 1`, но моделей и миграций нет. Настоящая проверка появится на этапе 5;
  до тех пор `503` без базы — нормальное состояние каркаса, что легко принять за поломку.
- Соответствие ответов backend схемам контракта проверяется только вручную и по
  типам, написанным по контракту руками (`src/common/contract.ts`). Автоматические
  контрактные тесты запланированы на этап 9; до них возможен дрейф.
- Решение не коммитить сгенерированный клиент делает `npm ci` обязательным перед
  любой сборкой frontend и требует, чтобы `openapi.yaml` всегда лежал на один уровень
  выше. Для деплоя frontend отдельно от репозитория это ограничение нужно учесть.

### Осознанные отклонения и уточнения относительно промпта

- `features/` и `entities/` не наполнены кодом: промпт требует подготовить слои,
  но одновременно запрещает пустую многоуровневую абстракцию. Компромисс — каталоги
  с описанием правил слоя без барrel-модулей и оберток.
- Кроме `GET /health` реализованы `/health/live` и `/health/ready`: они уже есть
  в контракте (этап 2, правило N-18), и делать вид, что их нет, значит расходиться с ним.
- В каркас добавлены глобальный фильтр ошибок и middleware `X-Request-Id`. Формально
  это больше, чем «пустой скелет», но без них любая ошибка каркаса нарушала бы контракт
  с первого запроса; бизнес-логики они не содержат.

### Следующий этап

Этап 4 — frontend на mock API ([`llm/04-frontend-mocks.md`](../llm/04-frontend-mocks.md)).

## Этап 4. Frontend на mock API

### Задача и подход

Реализован весь MVP-интерфейс независимо от backend, через тонкий типизированный адаптер над
`openapi-fetch`. DTO берутся только из генерируемой OpenAPI-схемы. Добавлены hash-маршруты
публичного календаря, подтверждения, защищенной отмены, owner-доступности, списка встреч и
переноса. Даты вводятся и показываются локально, а транспорт всегда использует UTC `Z`.

Management token остается в состоянии перехода/fragment URL, не сохраняется в browser storage
и передается API исключительно как `X-Booking-Token`. При `409` список слотов инвалидируется;
перенос не оптимистический, поэтому неуспешный запрос не меняет исходную встречу в UI.

Вместо тяжелого календаря использованы нативный date input и доступные radio-группы слотов.
Формы имеют labels, zod-валидацию, состояния loading/empty/error/conflict/success, live regions
и управление фокусом. Адаптивность обеспечена CSS grid и переходом в одну колонку.

### Mock layer и тесты

Добавлен stateful contract-aligned mock `frontend/tests/mockApi.ts`: все fixtures проверяются
TypeScript непосредственно против сгенерированных OpenAPI DTO. Он воспроизводит happy paths,
пустые ответы, `500` и `409`; реальные персональные данные не используются. Интеграционные
тесты проверяют создание, отмену, отсутствие токена в storage, conflict-refresh, owner CRUD и
неизменность исходного времени при неуспешном переносе. Timezone unit-тест сравнивает
`Europe/Moscow` и `America/New_York`.

### Выполненные проверки

- `frontend`: ESLint и TypeScript — без ошибок; Vitest — 15 тестов в 5 файлах, все зеленые;
  production build собран без запущенного mock server (367.66 kB / 113.39 kB gzip);
  Prettier check — без замечаний.
- Корневой OpenAPI lint — без предупреждений; проверены 14 уникальных `operationId` и 28 схем.
- Prism smoke — 24 проверки: guest/owner happy paths, `403/404/409/422/429/500/503`,
  обязательный token header и запрет неизвестных DTO-полей.
- Статический поиск не нашел `console.*` в коде приложения и project snapshot-файлов;
  интеграционный тест подтверждает пустые `localStorage` и `sessionStorage` после бронирования.
- `git diff --check` — без ошибок пробелов.

### Риски и ограничения

- Prism — stateless example server: межзапросные изменения состояния достоверно проверяются
  stateful mock layer, а Prism smoke подтверждает соответствие запросов самому контракту.
- Нативные date/datetime-local визуально различаются между браузерами; visual regression пока нет.
- Owner-раздел остается публичным по scope MVP и неприемлем для production.

### Следующий этап

Этап 5 — PostgreSQL и основной backend (`llm/05-backend-core.md`).

## Этап 5. PostgreSQL и основной backend

### Задача и подход

Спроектирована Prisma-модель календаря, доступности, бронирований, исторических резерваций,
outbox и журнала уведомлений. Начальная SQL migration дополняет возможности Prisma: GiST
exclusion constraint атомарно запрещает пересекающиеся окна, а partial unique indexes
гарантируют единственную активную резервацию слота и бронирования. Seed календаря `demo`
использует `upsert` и фиксированный UUID.

Prisma изолирован repository-классами. Реализованы calendar read, owner CRUD доступности,
публичный slots endpoint, owner list будущих встреч и read endpoint слотов переноса.
Контроллеры работают только с DTO, правила находятся в services, а расчет 30-минутных
слотов — чистый UTC domain service. Системное время заменено injectable `Clock`.

ValidationPipe различает отсутствующее обязательное значение (`400 MALFORMED_REQUEST`)
и нарушение значения (`422 VALIDATION_ERROR`), запрещает неизвестные поля и передает
корректную location (`body/query/path`) единому error mapper. Logging policy не пишет
headers/body/query, management token и персональные поля.

### Модель и constraints

- Booking сохраняется при отмене и переносе; `cancelledAt` и `rescheduledAt` поддерживают историю.
- `SlotReservation` имеет состояния `ACTIVE/RELEASED`; partial unique invariant подготовлен
  для транзакционных команд этапа 6 без небезопасного `find` перед `insert`.
- Границы и длительности проверяются CHECK constraints в UTC, окна ограничены 14 днями.
- Индексы покрывают owner list, availability range и active reservation slot query.
- Подробная ER diagram и объяснение SQL-only ограничений: [`data-model.md`](data-model.md).

### Проверки

- PostgreSQL 16 поднят с чистой базой; `prisma migrate deploy` применил единственную migration.
- `prisma db seed` успешно выполнен дважды.
- Unit tests покрывают генерацию, lead time, reservations, полуинтервалы, диапазон 31/90 дней,
  overlap mapping и UTC/DST при измененной `TZ` процесса.
- PostgreSQL integration suite проверяет adjacency/overlap на repository и constraint уровнях,
  active/released reservations, реальные HTTP DTO/CRUD и допустимое использование индексов
  через `EXPLAIN`.
- OpenAPI не изменялся: существующий контракт оказался достаточным.

### Осознанные границы этапа

RabbitMQ, outbox publisher, notification consumer и команды создания/отмены/переноса
бронирований не реализованы — это scope этапов 6 и 7. Таблицы под них уже готовы.

### Следующий этап

Этап 6 — жизненный цикл бронирования (`llm/06-booking-lifecycle.md`).

## Этап 6. Надежный жизненный цикл бронирования

### Задача и подход

Реализованы create, guest cancellation, получение минимальной cancellation card и owner
reschedule. Booking, SlotReservation и соответствующий `booking.*` OutboxEvent изменяются
одной интерактивной Prisma-транзакцией; RabbitMQ не подключался. Partial unique index активного
слота остается окончательной защитой гонок, а database unique violation отображается в
`409 SLOT_TAKEN`. Advisory transaction locks стабилизируют повторы одной команды и согласуют
изменения с availability.

Management token генерируется из 32 случайных байт, в Booking хранится только SHA-256,
сравнение выполняется constant-time. Для контрактного повтора create полный первый ответ
хранится 24 часа в AES-256-GCM ciphertext в `IdempotencyRecord`; ключ и Idempotency-Key
в базе отсутствуют в открытом виде. Token endpoints защищены rate limit, а logging policy
по-прежнему не пишет headers/body/query.

### Проверки

- ESLint, TypeScript, Prettier, Jest unit suite и production build.
- PostgreSQL 16: обе миграции и seed; API/integration tests create, replay, key reuse,
  cancellation details, повторную отмену, освобождение слота, перенос и no-op.
- Concurrency: восемь create одного слота, два reschedule в один слот, create одновременно
  с reschedule. Во всех случаях в целевом времени остается одна active reservation.
- Искусственная ошибка trigger при `booking.rescheduled` outbox insert дала `500`; проверено,
  что Booking и исходная reservation полностью восстановлены, а события нет.
- SQL-проверки не обнаружили orphan reservation или дубликатов доменных событий.

### Риски и ограничения

- Rate limiter локален одному процессу NestJS; при горизонтальном масштабировании нужен общий
  storage или ingress limiter. Для текущего single-process MVP это соответствует архитектуре.
- Просроченные idempotency records не воспроизводятся и удаляются при повторе ключа; для
  ограничения физического размера таблицы нужен периодический cleanup по `expires_at`.
- RabbitMQ publisher и consumer намеренно остаются этапом 7; outbox records уже атомарны.

### Следующий этап

Этап 7 — RabbitMQ publisher, retry/DLQ и идемпотентный consumer (`llm/07-rabbitmq-outbox.md`).
