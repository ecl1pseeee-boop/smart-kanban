# Smart Kanban

Real-time канбан-система уровня Jira/Trello с event-driven архитектурой, AI-автоматизацией (Anthropic Claude) и Telegram-ботом. Проект разрабатывается на хакатон **ЮНИТХАК**.

Полная спецификация — в [`SPEC.md`](./SPEC.md).

---

## Что внутри

- **Real-time канбан** — DnD карточек, оптимистичные обновления, WIP-лимиты, lock/unlock карточек, presence-аватары онлайн-пользователей, чек-листы и комментарии.
- **Event-driven backend** — typed in-process EventBus → Socket.IO bridge → React store. Один и тот же поток событий питает Automation, уведомления и фронтенд.
- **No-code Automation Engine** — правила «триггер + условия + действия». 7 типов действий: move_to_column, move_to_top, set_priority, add_tag, assign_to, notify_user, send_telegram. Dry-run тестирование без выполнения.
- **AI через Claude API** — декомпозиция задачи в чек-лист, ежедневная AI-выжимка доски, разбор баг-карточки по тексту/скриншоту. Структурированные ответы через `messages.parse()` + zod. **Graceful fallback на heuristic** при отсутствии `ANTHROPIC_API_KEY` или ошибке API.
- **Telegram-бот (Telegraf 4)** — команды `/start /tasks /summary /boards /help` и photo-handler для багов-скриншотов. Magic-link привязка через одноразовый код. **Stub-режим** без `TELEGRAM_BOT_TOKEN` — бот ничего не публикует наружу.
- **BullMQ pipeline** — приём входящих задач (Telegram / web-form / email / api / ai), SHA256-дедуп по часу, асинхронное обогащение.
- **Cron-джобы** — проверка дедлайнов каждые 15 мин (overdue / due-soon), утренний дайджест в 09:00 UTC, AI-выжимка в 18:00 UTC.
- **Уведомления** — single source of truth `createForUser` пишет в БД + emit'ит `notification:new` в персональную socket-комнату пользователя. На фронте — bell с unread-badge'ом, live-push в popover.

## Стек

| Слой        | Технология |
|-------------|------------|
| Runtime     | Node.js 20 LTS, pnpm 10 |
| Backend     | Fastify 4 + Zod, Prisma 6, PostgreSQL 16, Redis 7, ioredis |
| Real-time   | Socket.IO 4 + Redis adapter, namespace `/boards`, rooms `board:{id}` и `user:{id}` |
| Очереди     | BullMQ 5 |
| AI          | `@anthropic-ai/sdk` 0.96, `claude-sonnet-4-6`, structured outputs (`zodOutputFormat`) |
| Auth        | JWT HS256 (jose), argon2, refresh rotation |
| Telegram    | Telegraf 4 |
| Frontend    | React 18 + Vite 5, TypeScript, TanStack Router + Query, Zustand, Tailwind CSS 3 |
| DnD         | `@dnd-kit/core` + `/sortable` (sortable per column, оптимистичный move с revert) |
| Логирование | Pino (+ pino-pretty в dev) |

---

## Quick Start (dev)

> Требования: Node.js 20+, pnpm 10, Docker + Docker Compose.

```bash
# 1. Зависимости монорепо
pnpm install

# 2. ENV
cp .env.example .env
# Минимум — оставить как есть для dev (Postgres / Redis на дефолтных портах).
# ANTHROPIC_API_KEY и TELEGRAM_BOT_TOKEN можно не заполнять —
# код корректно работает в fallback-режиме.

# 3. Postgres + Redis в Docker
docker compose up -d postgres redis

# 4. Миграции + demo-данные
pnpm db:migrate
pnpm db:seed

# 5. Запустить api + web + bot параллельно
pnpm dev
```

После старта:

| Что | Где |
|---|---|
| **Web (Vite)** | http://localhost:3000 |
| **API (Fastify)** | http://localhost:3001 |
| **Swagger UI** | http://localhost:3001/documentation |
| **Health** | http://localhost:3001/health → `{status, db, redis, uptime}` |
| Socket.IO namespace | `ws://localhost:3001/socket.io`, namespace `/boards` |

Бот по умолчанию запустится в **stub-режиме** (нет `TELEGRAM_BOT_TOKEN`) — в логе будет сообщение со списком команд, но Telegram polling-loop не стартует. Это нормально для dev.

### Smoke-тесты

Все скрипты — в `apps/api/scripts/`. Запускать после `pnpm dev` (нужны работающие API + Postgres + Redis):

```bash
cd apps/api

# Socket.IO presence/rooms — Step 8
node scripts/socket-smoke.mjs

# Уведомления (live push + read/read-all) — Step 13
node scripts/notifications-smoke.mjs

# Telegram API surface (link/me/tasks/boards/summary/analyze-bug/queue) — Step 14
node scripts/telegram-smoke.mjs

# Auth → boards/state → lock → move → socket join → presence:state — Step 15
node scripts/web-smoke.mjs

# Правила (CRUD/toggle/test) + notification:new push — Step 16
node scripts/rules-notif-smoke.mjs
```

---

## Production (Docker Compose)

```bash
cp .env.example .env  # боевые секреты!
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

В compose сборки: `postgres`, `redis`, `api`, `web` (статика через nginx), `bot`, `nginx` (reverse-proxy + SSL termination в prod-overlay).

---

## Структура монорепо

```
unithack/
├── apps/
│   ├── api/        # Fastify backend
│   │   ├── prisma/                  # schema + миграции + seed
│   │   ├── scripts/                 # E2E smoke-тесты
│   │   └── src/
│   │       ├── config/              # env, prisma, redis
│   │       ├── modules/             # auth, boards, columns, tasks,
│   │       │                        # automation, queue, cron, ai,
│   │       │                        # notifications, telegram, health
│   │       ├── shared/              # errors, events, middleware, access, logger
│   │       ├── socket/              # Socket.IO setup + handlers + EventBus bridge
│   │       ├── queue/               # BullMQ registry
│   │       └── app.ts, server.ts
│   ├── web/        # React + Vite SPA
│   │   └── src/
│   │       ├── lib/                 # api, socket, types, format, query, env
│   │       ├── stores/              # auth, board, notifications (Zustand)
│   │       ├── hooks/               # useBoardSocket, useGlobalSocket
│   │       ├── components/          # board/, task/, automation/, notifications/, ui/
│   │       ├── routes/              # login, boards-list, board, rules
│   │       └── router.tsx, main.tsx
│   └── bot/        # Telegram-бот (Telegraf)
│       └── src/
│           ├── commands/            # start, tasks, boards, summary, help
│           ├── handlers/            # photo (bug from screenshot)
│           ├── api-client.ts        # HTTP клиент к /api/telegram/* с X-Bot-Secret
│           └── bot.ts
├── packages/
│   └── shared/     # Общие типы и константы между apps
├── docker/
│   ├── nginx/
│   └── postgres/
├── docker-compose.yml
├── docker-compose.prod.yml
└── SPEC.md
```

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                          КЛИЕНТЫ                            │
│  React SPA (DnD, real-time)     Telegram Bot     External   │
└────────┬───────────────────────────┬───────────────┬────────┘
         │ HTTP / WebSocket          │ HTTP          │ REST
         ▼                           ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                FASTIFY API (apps/api)                       │
│                                                             │
│  REST routes (Zod-validated)   Socket.IO `/boards`          │
│         │                              │                    │
│         ▼                              ▼                    │
│  Service layer ─────► TypedEventBus ◄── (3 subscribers)     │
│         │                  │     │  └─► Socket.IO bridge    │
│         ▼                  │     └────► AutomationEngine    │
│  Prisma (Postgres)         └──────────► NotificationService │
│                                                             │
│  BullMQ workers ◄──────────── Redis (queue + adapter)       │
│  Cron schedulers                                            │
└─────────────────────────────────────────────────────────────┘
```

### Event-driven flow (пример: drag-and-drop карточки)

```
SPA: optimistic store update
  └► PATCH /api/tasks/:id/move + X-Socket-Id header
       └► TaskService.move() — DB transaction
            └► eventBus.emit('task:moved', { ..., originSocketId })
                 ├► Socket.IO bridge → emit в room `board:{id}` (кроме originSocketId)
                 ├► AutomationEngine → matches('TASK_MOVED') → выполняет actions
                 │     └► может emit'нуть task:updated / notify_user / send_telegram
                 └► (другие подписчики)
```

Каждое доменное событие несёт `originSocketId` (из заголовка `X-Socket-Id`, прокинутого SPA), что позволяет на bridge'е **пропустить echo** обратно клиенту, который инициировал изменение, — фронт не получает дубликат своей же оптимистичной мутации.

### Real-time события (Socket.IO namespace `/boards`)

| Событие | Куда | Кто слушает |
|---|---|---|
| `task:created` / `task:updated` / `task:moved` / `task:deleted` / `task:locked` / `task:unlocked` | room `board:{id}` | SPA, обновляет Zustand store |
| `column:created` / `column:updated` / `column:deleted` / `column:reordered` | room `board:{id}` | SPA |
| `comment:added` / `comment:deleted` / `checklist:updated` | room `board:{id}` | SPA, обновляет TaskModal |
| `presence:state` (snapshot) / `presence:joined` / `presence:left` / `presence:viewing` | room `board:{id}` | SPA, рисует аватары |
| `notification:new` | room `user:{id}` | SPA bell + Telegram бот |

Клиент шлёт серверу: `board:join`, `board:leave`, `presence:viewing` (на открытие/закрытие TaskModal).

---

## Конфигурация (env-vars)

Полный пример — в [`.env.example`](./.env.example).

| Переменная | Назначение | Дефолт / пример | Обязательна? |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Креды Postgres для docker-compose | `kanban_user / kanban_dev_password / smart_kanban` | для compose |
| `DATABASE_URL` | Prisma connection string | `postgresql://kanban_user:...@localhost:5432/smart_kanban` | ✅ |
| `REDIS_PASSWORD` / `REDIS_URL` | Redis (cache + pubsub + queue) | `redis_dev_password` / `redis://:...@localhost:6379` | ✅ |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Подпись JWT (минимум 32 символа) | — | ✅ |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | TTL токенов | `15m` / `7d` | — |
| `PORT` | API HTTP port | `3001` | — |
| `NODE_ENV` | `development` / `production` / `test` | `development` | — |
| `LOG_LEVEL` | `fatal / error / warn / info / debug / trace` | `info` | — |
| `CORS_ORIGINS` | Список через запятую | `http://localhost:3000` | — |
| `ANTHROPIC_API_KEY` | AI Claude API | — | **опционально** — без неё код работает в heuristic-fallback |
| `AI_MODEL` | Модель Claude | `claude-sonnet-4-6` | — |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота | — | **опционально** — без него бот в stub-режиме |
| `BOT_SECRET` | Shared-секрет для `/api/telegram/*` (X-Bot-Secret) | — | ✅ если используется бот |
| `WEBHOOK_URL` | Публичный URL для Telegram webhook (prod) | — | — |
| `VITE_API_URL` / `VITE_WS_URL` | URL API/WebSocket для SPA | `http://localhost:3001` | — |
| `WEB_URL` (бот) | Базовый URL для ссылок «открыть в вебе» | `http://localhost:3000` | — |

---

## Demo-аккаунты

После `pnpm db:seed`:

| Email | Пароль | Роль (User) | На демо-доске |
|---|---|---|---|
| `admin@demo.com` | `Demo1234!` | ADMIN | OWNER |
| `tanya@demo.com` | `Demo1234!` | MEMBER (PM) | ADMIN |
| `dmitry@demo.com` | `Demo1234!` | MEMBER (Dev) | MEMBER |

Seed создаёт одну демо-доску с 5 колонками (Backlog → In Progress → Review → Done + Blocked) и 16 задачами, плюс 3 примера правил автоматизации.

---

## Telegram-бот: stub vs real режим

| Режим | Условие | Поведение |
|---|---|---|
| **stub** (по умолчанию в dev) | `TELEGRAM_BOT_TOKEN` отсутствует / пустой | Процесс стартует, логирует команды + `apiUrl`, и завершается. Telegraf polling не стартует. Полезно для CI и dev. |
| **real** | задан `TELEGRAM_BOT_TOKEN` + `BOT_SECRET` | Long-polling, регистрация команд через `setMyCommands`, обработка `/start ABC123` / `/tasks` / `/summary` / `/boards` / `/help` и `on('photo')` |

`BOT_SECRET` обязателен в обоих режимах — без него бот сразу выходит с warning'ом, так как любые запросы к `/api/telegram/*` упадут с 403.

### Привязка аккаунта (magic-link)

1. Web SPA → `POST /api/telegram/link/generate` (Bearer) → возвращает 8-hex код, TTL 10 мин в Redis.
2. Пользователь шлёт боту `/start ABC12345`.
3. Бот → `POST /api/telegram/link/confirm` с заголовком `X-Bot-Secret`, телом `{code, telegramId, telegramChatId, telegramName}`. API связывает `telegramId` с User и инвалидирует кеш.

### Photo handler (создание баг-карточки из скриншота)

1. `on('photo')` → бот скачивает наибольший variant в base64 (через `ctx.telegram.getFileLink`).
2. `POST /api/telegram/me/:telegramId/analyze-bug` (с caption как `description`, base64 в `imageBase64`) → AI Claude (vision) формирует `{title, description, priority, tags}` или, в fallback, heuristic-разбор.
3. Бот рисует preview с inline-кнопками выбора доски (`bug:create:<boardId>`) и `❌ Отмена`.
4. На подтверждение → `POST /api/telegram/me/:telegramId/queue/tasks` → IncomingTask в BullMQ → обогащение → реальная Task.

---

## API endpoints (краткая карта)

| Группа | Маршруты |
|---|---|
| Auth | `POST /api/auth/{register,login,refresh,logout}`, `GET /api/auth/me` |
| Boards | `GET/POST /api/boards`, `GET/PATCH/DELETE /api/boards/:id`, `GET/POST /api/boards/:id/members`, `GET /api/boards/:id/activity` |
| Columns | `GET/POST /api/boards/:id/columns`, `PATCH/DELETE /api/boards/:id/columns/:colId`, `POST /api/boards/:id/columns/reorder` |
| Tasks | `GET/POST /api/boards/:id/tasks`, `GET/PATCH/DELETE /api/tasks/:taskId`, `POST /api/tasks/:taskId/{move,lock,unlock}` |
| Comments / Checklist | `GET/POST/DELETE /api/tasks/:taskId/comments`, `PATCH /api/tasks/:taskId/checklist` |
| Automation | `GET/POST /api/boards/:id/rules`, `PATCH/DELETE /api/boards/:id/rules/:ruleId`, `POST /api/boards/:id/rules/:ruleId/{toggle,test}` |
| Queue | `POST /api/queue/tasks` (источники: telegram/web-form/email/api/ai), `GET /api/queue/tasks`, `POST /api/queue/tasks/:id/{approve,reject}` (admin) |
| Notifications | `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all` |
| AI | `POST /api/ai/{decompose,daily-summary,analyze-bug}` |
| Telegram | `POST /api/telegram/link/generate` (Bearer); `POST /api/telegram/link/confirm`, `GET /api/telegram/me/:tg{,/tasks,/boards}`, `POST /api/telegram/me/:tg/{boards/:b/summary,analyze-bug,queue/tasks}` (все — X-Bot-Secret) |
| Cron (admin) | `POST /api/admin/cron/{check-deadlines,morning-digest,evening-summary}` |
| Health | `GET /health` |

Все эндпоинты валидируют вход/выход через Zod и описаны в Swagger UI: http://localhost:3001/documentation.

---

## Документация

- **Архитектура** и event-driven flow — `SPEC.md` раздел 2
- **Prisma schema** (12 моделей + 8 enums) — `SPEC.md` раздел 3 и `apps/api/prisma/schema.prisma`
- **REST endpoints** — `SPEC.md` раздел 4 + Swagger UI на `/documentation`
- **WebSocket events** и presence — `SPEC.md` раздел 5
- **AutomationEngine** — `SPEC.md` раздел 6
- **AI интеграция** (промпты, fallback'и) — `SPEC.md` раздел 7
- **BullMQ pipeline** и cron — `SPEC.md` раздел 8
- **Telegram bot** — `SPEC.md` раздел 9
- **Frontend компоненты** (KanbanBoard / TaskCard / TaskModal / AutomationRuleBuilder / Zustand store) — `SPEC.md` раздел 10
- **Middleware и безопасность** (rate limits, helmet, CORS) — `SPEC.md` раздел 11
- **Обработка ошибок** (envelope, AppError иерархия) — `SPEC.md` раздел 12
