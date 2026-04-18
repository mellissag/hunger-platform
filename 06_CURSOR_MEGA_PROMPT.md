# Cursor Mega-Prompt — пошаговый запуск проекта

Этот файл — готовый **промпт для Cursor**, который можно вставить в новый пустой репозиторий и поэтапно сгенерировать всю платформу.

**Как использовать:**

1. Открой Cursor в пустой папке.
2. В корень положи все файлы из этой папки (`01_MASTER_SPEC.md`, `02_BOT_FLOWS.md` и т.д.) — Cursor будет на них ссылаться.
3. Также положи файл `.cursorrules` и папку `.cursor/` из `cursor_templates/` (см. `07_CURSOR_AUTOMATION.md`).
4. Открой Cursor Composer (⌘I).
5. Копируй и вставляй **каждую фазу последовательно**. Не все сразу — иначе контекстное окно переполнится.
6. После каждой фазы проверяй, что сгенерировалось, исправляй руками критичные ошибки, и только потом переходи к следующей.

---

## PHASE 0 — Инициализация

> Скопируй это в Cursor Composer:

```
Ты — ведущий fullstack-разработчик платформы Hunger Beauty — шаблона для салонов красоты.

Стек:
- Backend: Python 3.12, FastAPI, aiogram 3, SQLAlchemy 2 (async), Alembic, ARQ, pgvector.
- Frontend: Next.js 14 (App Router), TypeScript 5, Tailwind, shadcn/ui, TanStack Query, next-intl.
- DB: PostgreSQL 16, Redis 7.
- AI: Google Gemini 1.5 Flash.
- Deployment: Docker Compose + Caddy 2.

Прочитай файлы:
- 01_MASTER_SPEC.md — главная спека
- 02_BOT_FLOWS.md — FSM бота
- 04_ADMIN_PANEL.md — UX админки
- .cursor/rules/*.mdc — архитектурные правила

Твоя задача на Фазу 0: создать структуру репозитория согласно разделу 3.3 `01_MASTER_SPEC.md`:

1. Создай папки `backend/`, `frontend/`, `deploy/`, `docs/`, `.github/workflows/`.
2. Внутри `backend/`: `pyproject.toml` с нужными зависимостями, `Dockerfile`, `app/main.py` со stub FastAPI "hello".
3. Внутри `frontend/`: `package.json` с Next.js 14 + Tailwind + shadcn, `Dockerfile`, `src/app/page.tsx` со stub.
4. В корне: `.env.example`, `README.md`, `.gitignore` (Python + Node + IDE).
5. `deploy/docker-compose.yml` со службами postgres, redis, api, worker, web, caddy.
6. `deploy/Caddyfile` с reverse-proxy на api/web.
7. `deploy/scripts/install.sh`, `backup.sh`, `update.sh` (stub).

Ничего не придумывай сверх спеки. Не пиши бизнес-логику. Только scaffolding.

После создания — запусти `docker compose up -d --build` мысленно, перечисли, какие порты открыты и что увидит разработчик по http://localhost.
```

**Критерий завершения Phase 0:** `docker compose up` стартует, каждый сервис не падает.

---

## PHASE 1 — База данных и модели

```
Фаза 1. База данных.

Задачи:
1. Включи pgvector в postgres (init script в docker-compose).
2. В `backend/app/db/base.py` — async engine и session.
3. В `backend/app/models/`: создай SQLAlchemy-модели согласно `01_MASTER_SPEC.md` раздел 4.2:
   - salon, settings, user, master, service, service_category, master_service,
   - schedule_slot, client, client_note, booking, review, blacklist_entry,
   - broadcast, broadcast_recipient, kb_document, kb_chunk,
   - ai_conversation, ai_message, bot_visit_stat, audit_log, session.
4. Все строковые i18n-поля — тип `JSONB`.
5. Эмбеддинги — `Vector(768)` через pgvector.
6. В `alembic/` — инициализируй migration environment и сгенерируй первую миграцию `0001_initial.py`.
7. Реализуй `scripts/seed_init.py` (шаблон уже есть в `deploy/scripts/seed_init.py` — перенеси и адаптируй к финальным моделям).
   Скрипт создаёт:
   - 1 salon: name="Synchro", timezone="Europe/Sofia", currency="EUR", default_lang="ru"
   - 4 аккаунта (пароль из переменной окружения `SEED_PASSWORD`):
     - owner@adm-test.tech  (role: owner)
     - admin@adm-test.tech  (role: admin)
     - master@adm-test.tech (role: master)
     - reception@adm-test.tech (role: reception)
   - Настройки по умолчанию: theme=premium, prepayment_enabled=False, cancellation_free_hours=24
   - Идемпотентен: повторный запуск пропускается если салон уже существует.
   - НЕ создаёт тестовых клиентов, услуг и бронирований.
8. Seed вызывается: `docker compose exec api python -m scripts.seed_init`

Добавь индексы:
- booking(master_id, starts_at)
- booking(client_id, starts_at DESC)
- client(tg_user_id) UNIQUE
- kb_chunk USING ivfflat (embedding vector_cosine_ops)
- schedule_slot(master_id, starts_at)

Проверка: `alembic upgrade head` проходит без ошибок; seed создаёт все сущности.
```

---

## PHASE 2 — Auth, Users, RBAC

```
Фаза 2. Аутентификация и права.

1. `backend/app/core/security.py` — JWT (access 15m + refresh 30d), bcrypt.
2. `backend/app/core/permissions.py` — роли: owner, admin, master, reception + enum RolesRequired.
3. FastAPI dependency `get_current_user()` из заголовка Bearer.
4. Dependency `require_roles([...])` для защиты эндпоинтов.
5. `backend/app/api/v1/auth.py`:
   - POST /auth/login  (email+password → access+refresh)
   - POST /auth/refresh
   - POST /auth/logout
   - GET  /auth/me
6. `session` таблица хранит refresh tokens (revocable).
7. Rate limit на /login (5 попыток / 15 минут на IP).
8. Audit log записи на login / logout / role change.

Тесты:
- test_login_success
- test_login_wrong_password
- test_login_rate_limited
- test_refresh_rotation
- test_me_requires_auth
- test_role_required_decorator

Покрытие ≥ 85% в модуле auth.
```

---

## PHASE 3 — CRUD: clients, masters, services, bookings

```
Фаза 3. Базовые CRUD-эндпоинты.

Для каждой сущности: list / get / create / update / delete + поиск + пагинация.
Схемы в `backend/app/schemas/`. Бизнес-логика в `backend/app/services/`.

Особое внимание:
- clients: возвращать счётчики (total_bookings, total_revenue) через подзапросы или materialized.
- bookings: POST должен проверять пересечение слотов через SELECT ... FOR UPDATE.
- services: i18n-поля в формате {"en": "...", "ru": "...", "uk": "...", "bg": "..."}.
- bookings.create: валидация master выполняет эту услугу, слот свободен, клиент не в blacklist.
- master-role видит только свои объекты (через dependency filter_by_role).

Ошибки через кастомные Exception-классы (SlotTaken, ClientBlacklisted, etc.) → 409/403.

Напиши integration-тесты против testcontainers Postgres.
```

---

## PHASE 4 — Booking engine и schedule

```
Фаза 4. Движок записи и расписание.

1. `backend/app/services/schedule_service.py`:
   - get_available_slots(master_id, date, service_duration) → list[time]
   - Учитывает: working_hours, vacations, existing bookings, booking_buffer, booking_lead_time.
   - Всё в timezone салона.

2. `backend/app/services/booking_service.py`:
   - create_booking(...)
   - cancel_booking(id, by: user|client) → применяет политику (free_hours, fine, blacklist).
   - reschedule_booking(id, new_starts_at).
   - mark_completed(id), mark_no_show(id).

3. Race conditions:
   - Редуцируй через SELECT FOR UPDATE на master_id + startsat range.
   - Напиши concurrency-тест (asyncio.gather с 10 параллельными create_booking в один слот — ровно 1 должен выиграть).

4. Эндпоинты:
   - GET /schedule/slots?master_id=&service_id=&date=
   - GET /schedule/calendar?from=&to=&master_id?
   - POST /schedule/block (вне рабочего времени — отпуск/блок)
   - DELETE /schedule/block/:id

Тесты: pytest +  фикстура «fake_now» для детерминизма.
```

---

## PHASE 5 — Telegram-бот (core flows)

```
Фаза 5. Бот на aiogram 3.

1. `backend/app/bot/__init__.py` — Dispatcher, Router.
2. `backend/app/bot/middlewares/i18n.py` — подхват client.lang.
3. `backend/app/bot/middlewares/user.py` — авто-создание client при /start.
4. `backend/app/bot/middlewares/throttle.py` — 1 msg / 500ms.
5. `backend/app/bot/states.py` — все FSM-states (см. 02_BOT_FLOWS.md §1).
6. `backend/app/bot/routers/`:
   - start.py — /start + выбор языка (если нет)
   - language.py — смена языка
   - booking.py — весь flow из §4 (ChooseFlowType → PickMaster/Service → PickDate → PickTime → EnterName/Phone → Confirm → Prepayment → Success)
   - my_bookings.py — список + карточка + отмена + перенос
   - profile.py
   - about.py
7. Inline-клавиатуры в `backend/app/bot/keyboards/` — каждая страница отдельной функцией.
8. Тексты через Fluent: `backend/app/bot/texts/{en,ru,uk,bg}/messages.ftl`.
9. Webhook-эндпоинт: POST /api/v1/tg/webhook/{secret} в `api/v1/tg.py`.
10. Health endpoint проверяет setWebhook.

Тесты:
- pytest + aiogram-tests: симуляция /start → язык → меню → запись → confirm.
- Тест сценария «слот занят пока думал» (race).
- Тест клиента в блэклисте.

Критерий: реальный бот с настроенным webhook записывает в БД корректные записи.
```

---

## PHASE 6 — Workers (reminders, broadcasts)

```
Фаза 6. ARQ workers.

1. `backend/app/workers/reminders.py`:
   - Запускается каждые 5 минут.
   - Находит bookings WHERE status='confirmed' AND starts_at BETWEEN NOW() AND NOW()+26h.
   - Для каждой — проверяет флаги `reminder_sent_24h/2h/30m` и если не отправлено — шлёт через Telegram.
   - Таблица `booking` имеет три bool-колонки для идемпотентности.

2. `backend/app/workers/broadcasts.py`:
   - Обрабатывает задачу `send_broadcast(broadcast_id)`.
   - Разрезает получателей на батчи по 25 (Telegram rate limit 30 msg/sec).
   - Шлёт, логирует результат в broadcast_recipient, обновляет broadcast.stats.
   - Учитывает FloodWaitError.

3. `backend/app/workers/indexer.py`:
   - Задача `index_kb_document(doc_id)`: chunking + embedding + save в kb_chunk.

4. ARQ запускается отдельным Docker-сервисом `worker`.

Тесты:
- reminder отправляется ровно 1 раз (идемпотентно).
- broadcast правильно обрабатывает Telegram 429.
```

---

## PHASE 7 — AI (Gemini + RAG)

```
Фаза 7. AI-консультант.

1. `backend/app/services/ai_service.py`:
   - ask(client_id, question) → (answer, cited_chunk_ids)
   - Использует Gemini 1.5 Flash через google-generativeai или httpx.
   - Embedding через text-embedding-004.
   - Retrieve top-5 чанков через pgvector cosine.
   - Собирает prompt по шаблону из settings.ai_system_prompt.
   - Стриминг ответа.
   - Rate limit 20/hour/client.
   - Логирование в ai_conversation + ai_message.

2. Bot router `ai_consult.py`:
   - Вход из меню → state AIChat.
   - Любое сообщение → ai_service.ask + показ ответа + кнопки [🗓 Записаться] [👎 Плохой ответ] [🏠 Меню].
   - 🔕 Без AI — флаг client.prefers_no_ai=true.

3. API:
   - POST /ai/test_chat (admin only) — тестирование из админки.
   - GET /ai/conversations (paginated) — список диалогов.
   - POST /ai/flag/:message_id — пометка плохого ответа.
   - CRUD для kb_document + trigger индексации.

4. Graceful degradation:
   - Если GEMINI_API_KEY пустой — AI-фичи выдают 503 с user-friendly сообщением.

Тесты:
- моки Gemini через respx.
- проверка rate limit.
- проверка, что AI не записывает (allow_booking=false).
```

---

## PHASE 8 — Frontend скелет (Next.js + auth)

```
Фаза 8. Next.js скелет.

1. `frontend/src/app/(auth)/login/page.tsx`:
   - Форма email+password.
   - POST /auth/login.
   - Сохранение токена в httpOnly cookie через Next.js route handler.
   - Реализовать 3 темы (см. design/login_variants.html).

2. `frontend/src/app/(admin)/layout.tsx`:
   - Sidebar + topbar (shadcn).
   - Проверка роли (middleware.ts): не owner/admin/reception → 403.
   - Переключение темы (CSS variables on :root).

3. `frontend/src/app/(master)/layout.tsx` — аналогично для master.

4. `frontend/src/lib/api.ts`:
   - Обёртка над fetch с автоматической refresh-ротацией.

5. `frontend/src/lib/permissions.ts`:
   - can(user, action, resource).

6. `frontend/src/messages/{en,ru,uk,bg}.json` — ключи для layout.

7. shadcn/ui компоненты: Button, Input, Card, Tabs, Dialog, Drawer, Table, Toast, Tooltip.

Критерий: login работает, cookies ставятся, после логина редирект в /dashboard, logout через topbar-меню.
```

---

## PHASE 9 — Admin pages (CRUD)

```
Фаза 9. Основные страницы админки.

Создай страницы согласно `04_ADMIN_PANEL.md`:
- /dashboard (KPI, charts, feed — см. design/admin_friendly.html)
- /bookings (calendar view + table view)
- /clients (list + [id] карточка с заметками — ключевая!)
- /masters (list + [id] с табами)
- /services (categories + services CRUD + i18n табы)
- /schedule (календарь всех мастеров)

Используй:
- TanStack Query для data fetching.
- TanStack Table для таблиц.
- react-hook-form + zod для форм.
- Recharts для графиков.
- Drawer (shadcn) вместо modal для CRUD.

Карточка клиента должна включать:
- Блок KPI
- Список заметок (pinned сверху) с добавлением/редактированием/удалением
- Табы: Записи, Отзывы, AI-диалоги
- Кнопки: Записать, Добавить заметку, В блэклист, Написать в ТГ

Каждая страница имеет empty state и skeleton loader.

Тесты Playwright:
- login → dashboard (видит KPI)
- /clients → создание клиента → добавление заметки → просмотр
- /masters/[id] → редактирование расписания
- /bookings → создание брони → отображается на календаре
```

---

## PHASE 10 — Broadcasts и сегменты

```
Фаза 10. Рассылки.

1. Backend:
   - `backend/app/services/segment_service.py` — билдер сегмента.
   - Поддержка сегментов: all, new_last_N, dormant, birthday_range, by_service, by_master, VIP, regular, by_tag, by_lang, no_show, (exclude) blacklist.
   - GET /segments/preview?criteria=... → кол-во получателей.

2. Broadcast CRUD + state machine (draft → scheduled → sending → sent/failed).

3. Schedulable через ARQ (enqueue at scheduled_at).

4. Frontend:
   - /broadcasts — list.
   - /broadcasts/new — wizard: Сегмент → Контент (i18n табы + медиа + inline кнопки) → Расписание → Preview.
   - Live-счётчик получателей в step 1.
   - Превью как в Telegram.

5. Воркер send_broadcast:
   - 25 msg per second rate.
   - Retry on 429 с exponential backoff.
   - Обновление broadcast.stats.

Тесты: segment builder (edge cases), broadcast workflow e2e.
```

---

## PHASE 11 — Statistics и finance

```
Фаза 11. Статистика.

1. Backend сервисы:
   - bot_stats_service: посетители, joins, started/completed/abandoned bookings, AI-сессии.
   - booking_stats_service: revenue, conversion, avg check, LTV, retention, heatmap (day × hour).
   - master_stats_service: per-master revenue, bookings, rating, utilization, payroll.
   - service_stats_service: top services, dead services.

2. Все stats с фильтром периода (from, to).

3. Агрегация через materialized views или view + индексы; инкрементальные обновления в `bot_visit_stat`.

4. Frontend:
   - /statistics/overview — KPI + revenue trend + heatmap.
   - /statistics/bot — funnel (start → booked → completed).
   - /statistics/masters — таблица + drill-down.
   - /statistics/services — top + dead list.
   - /statistics/finance — master payroll calculator + export XLSX/PDF.

Тесты: проверка корректности агрегации на seed-данных.
```

---

## PHASE 12 — AI-админка + Blacklist + Settings

```
Фаза 12. Финальные страницы.

1. /ai/kb — два столбца: список документов слева, редактор справа. Upload PDF/DOCX → backend chunks + embeds.
2. /ai/prompt — редактор system prompt с подсветкой переменных, few-shot примеры, переключатели, slider температуры.
3. /ai/conversations — список + drill-down диалога.
4. /ai/test_chat — живой эмулятор.

5. /blacklist — таблица с действиями, диалог добавления с поиском клиента.

6. /settings (owner only) — все табы из 13.1–13.11 (04_ADMIN_PANEL.md).
   - Каждый таб — отдельная подстраница или вертикальные tabs.
   - Brand: upload logo/cover/favicon.
   - Тема: radio minimal/friendly/premium + primary color picker — мгновенный preview.
   - Cancellation: форма с enum выбора политики.
   - Telegram: поля токена, кнопка «Проверить» (getMe).
   - Backups: cron-селектор + список + download last.

7. /users (owner only) — CRUD, инвайт через email.

8. /audit-log (owner only) — таблица событий с фильтрами.

Тесты: e2e Playwright по Settings — меняем валюту, предоплату, тему → проверяем применение.
```

---

## PHASE 13 — Mini App, Reviews, Notifications

```
Фаза 13. Telegram Mini App.

1. `frontend/src/app/mini-app/*`:
   - layout.tsx — use Telegram.WebApp SDK.
   - page.tsx — витрина услуг (grid cards с фото).
   - masters/page.tsx — карточки мастеров.
   - book/page.tsx — календарь + слоты (та же логика, что в боте).

2. Валидация initData на backend через HMAC (новый middleware).

3. Bot router: при /book показывает кнопку web_app.

4. Review flow:
   - Воркер через `settings.review_delay_hours` после `completed` — шлёт запрос.
   - Stars + коммент → сохранение review.
   - Отзыв влияет на master.rating_avg, rating_count.

5. Admin notify:
   - Если `settings.admin_notify_chat_id` задан — все значимые события дублируются в этот чат.

Тесты: Mini App рендерится, отправка данных обратно в бот работает.
```

---

## PHASE 14 — Deployment, install.sh, CI

```
Фаза 14. Продакшн.

1. Финализируй `deploy/docker-compose.prod.yml`.
2. Caddyfile: автотлс через Let's Encrypt, reverse proxy.
3. `scripts/install.sh`:
   - Установка Docker.
   - Clone repo, git checkout tag.
   - Генерация .env (случайные секреты).
   - Вопросы: DOMAIN, EMAIL, TG_TOKEN, GEMINI_KEY.
   - docker compose up.
   - alembic upgrade head.
   - seed базовых данных (owner + settings).
   - Вывод: URL + логин/пароль.

4. `scripts/backup.sh`: pg_dump с ротацией 7/4/3.

5. `scripts/update.sh`: git fetch tag + pull images + compose up + migrations.

6. GitHub Actions `ci.yml`:
   - matrix: 3.12, Node 20.
   - lint + typecheck + test (backend + frontend).
   - build docker images.
   - optional trivy scan.

7. `release.yml`: на git tag vX.Y.Z → build + push images to GHCR + create GitHub Release.

8. Docs: `docs/INSTALL.md`, `docs/ADMIN_GUIDE.md`, `docs/MASTER_GUIDE.md`.

Критерий: один клиент покупает лицензию → скачивает install.sh → на свежем Ubuntu 24.04 за < 10 минут получает рабочую платформу.
```

---

## PHASE 15 — Полировка и приёмка

```
Фаза 15. Final polish.

1. Пройти по `01_MASTER_SPEC.md` §15 (acceptance) — каждый пункт работает.
2. Прогнать все e2e Playwright.
3. Backend coverage ≥ 70%.
4. Frontend: все страницы responsive (desktop, tablet, mobile).
5. a11y-аудит главных страниц.
6. Lighthouse: Performance ≥ 85, Accessibility ≥ 90.
7. Прогнать security-auditor agent (см. .cursor/agents).
8. Написать changelog.md.
9. Записать демо-видео (скринкаст 5 минут: установка + главные сценарии).

Финальный релиз: git tag v1.0.0.
```

---

## Важные правила при работе с Cursor

1. **Не грузи все файлы спеки разом.** Указывай Cursor только нужные (`@01_MASTER_SPEC.md` для фазы БД, `@02_BOT_FLOWS.md` для фазы бота и т.д.).
2. **После каждой фазы — коммит.** Используй конвенцию: `feat(phase-N): <summary>`.
3. **Запуск агентов** (из `.cursor/agents/`) на review и test-writing — описано в `07_CURSOR_AUTOMATION.md`.
4. **При ошибках** — не проси Cursor «всё исправить». Локализуй: скопируй стек-трейс + ссылку на файл.
5. **Каждая новая фича** → сначала тест, потом код (TDD опционально, но желательно).
6. **Перед мёржем в main** — обязательно прогонка CI.

---

Успехов! Если на каком-то шаге застрял — открой новый чат, подгрузи только релевантные файлы (максимум 3), и сформулируй узкую задачу.
