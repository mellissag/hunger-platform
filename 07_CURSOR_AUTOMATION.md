# Cursor Automation — правила, агенты, CI

Чтобы Cursor «сам всё проверял» и не забивал контекстное окно, мы настраиваем **три слоя автоматизации**:

1. **Cursor Rules** (`.cursor/rules/*.mdc`) — правила архитектуры, которые Cursor всегда держит в голове.
2. **Sub-agents** (`.cursor/agents/*.md`) — выделенные ассистенты, которые вызываются под узкую задачу и возвращают короткий отчёт.
3. **GitHub Actions CI** — независимый от Cursor контур проверок.

Все три слоя работают **независимо**, поэтому если один падает — остальные страхуют.

---

## Слой 1 — Cursor Rules

Положи в корень репо папку `.cursor/rules/` с файлами ниже. Cursor 0.40+ автоматически подтягивает `.mdc`-файлы. Каждый `.mdc` имеет front-matter с настройкой `apply`:
- `always` — правило активно всегда.
- `auto-attach` — подключается, когда упомянуты подходящие файлы.
- `on-request` — только по явному обращению.

### `.cursor/rules/architecture.mdc`

```markdown
---
description: Глобальные архитектурные правила Hunger Beauty.
apply: always
---

# Архитектура

- Проект — single-tenant: 1 инсталляция = 1 салон. Никогда не добавляй salon_id в WHERE — он один.
- Backend: Python 3.12 + FastAPI + aiogram 3 + SQLAlchemy 2 async.
- Frontend: Next.js 14 App Router + TS strict + Tailwind + shadcn/ui.
- БД PostgreSQL 16, кеш/очереди Redis 7, эмбеддинги pgvector.
- AI: Google Gemini 1.5 Flash через адаптер. Никогда не зашивай провайдера — только через `ai_service`.
- Все строковые i18n-поля = JSONB `{en,ru,uk,bg}`.
- Валюта и ТЗ — из `settings`, никогда не хардкодь.
- Логи — structured JSON через structlog.
- Секреты — только через `.env`, никогда в коде.
- Никаких сторонних админ-тулов (pgAdmin, Adminer) — всё через админку.

# Слои
- `models/` — только SQLAlchemy-модели, без бизнес-логики.
- `schemas/` — Pydantic v2, для API и валидации.
- `services/` — бизнес-логика, принимает `AsyncSession` в конструкторе.
- `api/v1/` — тонкие роуты, только роутинг + вызов `services`.
- `bot/routers/` — тонкие хендлеры aiogram.
- `workers/` — ARQ задачи, идемпотентны.

# Никогда
- Не делай миграцию руками — только Alembic autogenerate.
- Не пиши SQL-строки — только SQLAlchemy Core/ORM.
- Не создавай N+1: используй selectinload/joinedload.
- Не используй sync-драйверы — только async.
```

### `.cursor/rules/backend.mdc`

```markdown
---
description: Правила для backend-кода.
apply: auto-attach
globs:
  - backend/**
---

# Backend conventions

- Async везде. Никогда не вызывай `session.commit()` без `await`.
- Все эндпоинты имеют response_model из `schemas/`.
- RBAC через `Depends(require_roles([Role.OWNER, Role.ADMIN]))`.
- Ошибки доменные — отдельные Exception-классы в `core/exceptions.py`:
  - `SlotTakenError`, `ClientBlacklistedError`, `InvalidScheduleError`, `LicenseExpiredError`, etc.
- Exception handlers в `main.py` мапят эти классы в 4xx/5xx ответы.
- Тесты pytest + pytest-asyncio, фикстуры в `tests/conftest.py`.
- Testcontainers для интеграционных тестов.
- Никогда не используй `print()` — только `logger`.
- Все таймстампы — UTC в БД, конверсия в timezone салона на уровне представления.
- Для concurrency-safe операций (booking create) — `SELECT ... FOR UPDATE`.
```

### `.cursor/rules/frontend.mdc`

```markdown
---
description: Правила для frontend-кода.
apply: auto-attach
globs:
  - frontend/**
---

# Frontend conventions

- TypeScript strict, `noUncheckedIndexedAccess: true`.
- Server Components по умолчанию. Client Components — только при необходимости ("use client").
- Data fetching: TanStack Query на клиенте, `fetch` с cache-control на сервере.
- Формы: `react-hook-form` + `zod`. Никогда не используй uncontrolled inputs без zod schema.
- Таблицы: `@tanstack/react-table` v8 + server-side pagination.
- Стилизация: только Tailwind + CSS variables. Никаких inline styles кроме динамических цветов темы.
- UI-примитивы: shadcn/ui. Если чего-то нет — добавь через `npx shadcn add`.
- i18n: `next-intl`, все user-facing строки через `t('key')`.
- Pre-check на новой странице: title в head, empty state, skeleton loader, error boundary.
- Никогда не рендери `<img>` — только `next/image`.
- a11y: все интерактивные элементы должны быть доступны с клавиатуры.
- Темы: 3 пресета через CSS variables, применяются на `:root`.
```

### `.cursor/rules/i18n.mdc`

```markdown
---
description: Правила локализации — 4 языка синхронны всегда.
apply: always
---

# i18n

- 4 языка: en, ru, uk, bg.
- После каждого добавления ключа в `en.json` — **сразу** добавь его в остальные 3 файла (даже если значение временное — «[TODO:ru] Original text»).
- Никогда не коммить код, где есть хардкоднутая строка, видимая пользователю.
- Data-level i18n (услуги, рассылки, промпты) — JSONB формата `{en:"...", ru:"...", uk:"...", bg:"..."}`.
- В UI админки для i18n-полей всегда делай 4 таба (EN/RU/UK/BG) + кнопку «Перевести автоматически» (через Gemini).
- Forматирование чисел/дат — через Intl API с учётом текущей locale.
- Множественное число — ICU plural.
- Всегда проверяй через агента `i18n-checker` после значимых правок.
```

### `.cursor/rules/security.mdc`

```markdown
---
description: Security checklist для всех изменений.
apply: always
---

# Security

- Никогда не возвращай `password_hash`, `api_keys`, `license_key` в API response.
- Все мутирующие эндпоинты — под `require_roles(...)`.
- Master-роль видит только свои объекты (бронирования, клиентов-через-бронирования). Enforce на уровне сервиса через `current_user.master_id`.
- Webhook Telegram: проверяй `X-Telegram-Bot-Api-Secret-Token`.
- Mini App `initData`: HMAC-проверка обязательна на каждом запросе.
- Input validation: Pydantic строго, без `Extra.allow`.
- Rate limiting: slowapi на /auth/login, /auth/refresh, /ai/*.
- SQL: только через ORM — никаких f-string запросов.
- XSS: Next.js escape по умолчанию; никаких `dangerouslySetInnerHTML` без sanitize.
- CSP headers в production Caddy.
- Secrets в `.env`, никогда в git.
- При любом критичном действии — запись в `audit_log`.
- PII (телефоны, email клиентов) — маскируется в логах.
- Перед релизом — security-review agent и `npm audit` / `pip-audit`.
```

### `.cursor/rules/testing.mdc`

```markdown
---
description: Как писать тесты.
apply: auto-attach
globs:
  - backend/tests/**
  - frontend/**/*.test.ts
  - frontend/**/*.spec.ts
---

# Testing

- Backend unit: pytest + pytest-asyncio, моки через pytest-mock.
- Integration: testcontainers-postgres.
- Bot: aiogram-tests, проверяем full FSM flow.
- Frontend unit: Vitest + Testing Library.
- E2E: Playwright, отдельный docker-compose.test.yml.
- Каждая бизнес-фича — минимум 1 happy path + 1 edge case.
- Race conditions — явный concurrency test через asyncio.gather.
- Coverage threshold backend ≥ 70%, ключевые services ≥ 85%.
- Никогда не пиши тесты с `time.sleep` — только `freezegun`/фиктивное now.
- Seed-данные — фикстуры `tests/fixtures/`, никогда не завязываемся на prod seed.
```

---

## Слой 2 — Sub-agents

В `.cursor/agents/` складываем markdown-файлы. Каждый — отдельный «маленький разум» с собственной системной ролью. Вызываются через Composer `@agent-name` или через хуки.

### `.cursor/agents/code-reviewer.md`

```markdown
---
name: code-reviewer
description: Независимый код-ревьюер. Вызывается после значимых правок.
model: sonnet
tools: [Read, Grep, Glob]
---

Ты — строгий код-ревьюер проекта Hunger Beauty.

Тебе на вход подаётся diff. Проверь:

1. Соответствие `.cursor/rules/*.mdc` (прочитай их сам).
2. Нет ли N+1 запросов.
3. Все ли новые эндпоинты защищены RBAC.
4. i18n: не появилось ли хардкода строк.
5. Security: нет ли утечек секретов, SQL-injection рисков, XSS.
6. Есть ли тесты на новую функциональность.
7. Exception handling: доменные ошибки, а не generic Exception.

Формат ответа — короткий отчёт:

### ✅ Хорошо
- (бул)

### ⚠️ Улучшить
- (путь:строка) что и почему

### ❌ Блокеры
- (путь:строка) что и почему

Если блокеров нет — пиши «Approved». Никакого лишнего текста.
Максимум 300 слов.
```

### `.cursor/agents/test-writer.md`

```markdown
---
name: test-writer
description: Пишет тесты для новой бизнес-логики.
model: sonnet
tools: [Read, Write, Edit, Grep, Bash]
---

Ты пишешь pytest-тесты для services/. Правила:

1. Прочитай сам сервис и его типы.
2. Покрой: happy path, валидация, permissions, edge cases, concurrency (если применимо).
3. Используй фикстуры из `tests/conftest.py` (db_session, test_client, auth_headers).
4. Моки внешних API — respx / pytest-mock.
5. Для бронирований — обязательно race-condition-тест через `asyncio.gather`.
6. Для бота — `aiogram-tests` с фиктивным Dispatcher.
7. Покрытие нового кода ≥ 85%.

Запусти `pytest` и убедись, что тесты проходят. Если нет — исправь.
Отчёт: список добавленных файлов + coverage before/after.
```

### `.cursor/agents/i18n-checker.md`

```markdown
---
name: i18n-checker
description: Проверяет синхронность переводов и отсутствие хардкоднутых строк.
model: haiku
tools: [Read, Grep, Glob, Bash]
---

Твоя задача: за 3 минуты выдать отчёт о состоянии i18n.

1. Прочитай `frontend/src/messages/{en,ru,uk,bg}.json`.
   - Собери все ключи каждого файла.
   - Отчёт: ключи, которых нет во всех 4 файлах.
   - Отчёт: ключи со значением `[TODO:xx]`.

2. Прочитай `backend/app/bot/texts/{en,ru,uk,bg}/messages.ftl`.
   - Аналогично.

3. Grep по `frontend/src/` для строк-кандидатов хардкода:
   - регулярки типа `"[А-Яа-яЁё]{4,}"` и `">[A-Z][a-z]{3,}<"`.
   - Отсеивай комментарии и тестовые данные.

4. Формат отчёта:

### Missing keys
- en → ru: [list]
- en → uk: [list]
- en → bg: [list]

### TODO values
- [list: file:key]

### Suspected hardcoded strings
- [file:line] "text"

Если всё чисто — пиши «✅ i18n clean». Максимум 200 слов.
```

### `.cursor/agents/security-auditor.md`

```markdown
---
name: security-auditor
description: Проверяет код на OWASP Top 10 и утечки секретов.
model: sonnet
tools: [Read, Grep, Glob, Bash]
---

Ты — Security Auditor. Пройдись по OWASP Top 10:

A01 Broken Access Control
 - Нет ли эндпоинтов без `require_roles`?
 - Master видит только свои данные?
 - Audit log пишется?

A02 Cryptographic Failures
 - Пароли через bcrypt?
 - HTTPS enforced?
 - JWT secret не в коде?

A03 Injection
 - Только ORM, никаких f-string SQL?
 - Pydantic validation везде?

A04 Insecure Design
 - Rate limits на логине и AI?
 - Lockout после N попыток?

A05 Misconfiguration
 - `.env.example` без реальных ключей?
 - Debug=False в prod?
 - CORS узкий?

A06 Vulnerable Components
 - pip-audit / npm audit без HIGH+?

A07 Authentication
 - Refresh tokens отзываемы?
 - 2FA (опц.)?

A08 Data Integrity
 - Webhook с secret check?
 - Migrations в git?

A09 Logging
 - Секреты не в логах?
 - PII маскируется?

A10 SSRF
 - AI и image downloads — только allowlist?

Выдай отчёт разделами A01..A10. По каждому: ✅ OK / ⚠️ Issue / ❌ Critical.
Максимум 500 слов.
```

### Как вызывать агентов

- Вручную: `@code-reviewer` в Composer.
- Автоматически (Cursor 0.42+ hooks):
  ```jsonc
  // .cursor/hooks.json
  {
    "on_file_save": {
      "when": "**/*.py",
      "agent": "code-reviewer",
      "scope": "changes"
    },
    "on_commit": {
      "agent": "test-writer",
      "scope": "uncovered"
    },
    "on_branch_pr": {
      "agents": ["security-auditor", "i18n-checker"]
    }
  }
  ```
- Почему не забивается контекст: каждый агент запускается в **отдельном контексте**, возвращает только краткий отчёт в основной чат.

---

## Слой 3 — GitHub Actions CI

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    name: Backend (lint + types + tests)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: hunger_test
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
        ports: [5432:5432]
      redis:
        image: redis:7-alpine
        ports: [6379:6379]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'
      - name: Install deps
        run: |
          cd backend
          pip install -e ".[dev]"
      - name: Ruff (lint)
        run: cd backend && ruff check .
      - name: Black (format)
        run: cd backend && black --check .
      - name: Mypy (types)
        run: cd backend && mypy app/
      - name: Alembic upgrade
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:test@localhost/hunger_test
        run: cd backend && alembic upgrade head
      - name: Pytest
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:test@localhost/hunger_test
          REDIS_URL: redis://localhost:6379
        run: cd backend && pytest --cov=app --cov-report=xml --cov-fail-under=70
      - name: Upload coverage
        uses: codecov/codecov-action@v4

  frontend:
    name: Frontend (lint + types + tests)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      - run: cd frontend && npm ci
      - run: cd frontend && npm run lint
      - run: cd frontend && npx tsc --noEmit
      - run: cd frontend && npm run test -- --run
      - run: cd frontend && npm run build

  e2e:
    name: Playwright E2E
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.test.yml up -d --build
      - run: docker compose exec -T api alembic upgrade head
      - run: docker compose exec -T api python -m scripts.seed_demo
      - uses: actions/setup-node@v4
        with: {node-version: '20'}
      - run: cd frontend && npm ci && npx playwright install --with-deps
      - run: cd frontend && npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: frontend/playwright-report/

  security:
    name: Security scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Trivy FS scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          severity: HIGH,CRITICAL
          exit-code: '1'
      - uses: actions/setup-python@v5
        with: {python-version: '3.12'}
      - run: pip install pip-audit && pip-audit -r backend/requirements.txt || true
      - uses: actions/setup-node@v4
        with: {node-version: '20'}
      - run: cd frontend && npm audit --audit-level=high || true

  claude-review:
    name: Claude PR review
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: {fetch-depth: 0}
      - name: Claude Code review
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Review this pull request. Use agents from .cursor/agents/:
            - code-reviewer (always)
            - security-auditor (if changes touch auth/api/bot)
            - i18n-checker (if changes touch i18n files)
            Post a single consolidated comment on the PR.
```

### `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build & push API
        uses: docker/build-push-action@v5
        with:
          context: backend
          push: true
          tags: ghcr.io/${{ github.repository }}/api:${{ github.ref_name }},ghcr.io/${{ github.repository }}/api:latest
      - name: Build & push Web
        uses: docker/build-push-action@v5
        with:
          context: frontend
          push: true
          tags: ghcr.io/${{ github.repository }}/web:${{ github.ref_name }},ghcr.io/${{ github.repository }}/web:latest
      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            deploy/scripts/install.sh
            deploy/docker-compose.prod.yml
```

---

## Слой 4 (бонус) — pre-commit

### `.pre-commit-config.yaml`

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks:
      - id: ruff
        args: [--fix]
        files: ^backend/
      - id: ruff-format
        files: ^backend/

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.11.2
    hooks:
      - id: mypy
        files: ^backend/app/
        additional_dependencies: [pydantic, sqlalchemy]

  - repo: local
    hooks:
      - id: eslint
        name: eslint
        entry: bash -c 'cd frontend && npx eslint --fix'
        language: system
        files: \.(ts|tsx)$
      - id: tsc
        name: tsc
        entry: bash -c 'cd frontend && npx tsc --noEmit'
        language: system
        files: \.(ts|tsx)$
        pass_filenames: false
      - id: i18n-sync
        name: i18n-sync
        entry: python scripts/check_i18n.py
        language: system
        files: messages/.*\.json$|texts/.*\.ftl$
        pass_filenames: false
```

---

## Резюме — что куда ложится

```
.cursor/
  rules/
    architecture.mdc
    backend.mdc
    frontend.mdc
    i18n.mdc
    security.mdc
    testing.mdc
  agents/
    code-reviewer.md
    test-writer.md
    i18n-checker.md
    security-auditor.md
  hooks.json

.github/
  workflows/
    ci.yml
    release.yml

.pre-commit-config.yaml
```

Все эти файлы будут сгенерированы Cursor'ом во **Phase 0** при правильном промпте (см. `06_CURSOR_MEGA_PROMPT.md`).

---

## Как это гарантирует качество без забивания контекста

- **Rules** всегда загружены, но легковесны (короткие markdown).
- **Агенты** вызываются изолированно и возвращают краткий отчёт — основной чат получает 200–500 слов вместо 50k токенов кода.
- **CI** работает параллельно с разработкой — ты не тратишь локальные токены Cursor на прогон тестов.
- **Hooks** автоматизируют рутину: сохранил файл → code-reviewer пробежал → либо тишина либо короткий список замечаний.

Так ты удерживаешь контекст чистым и получаешь непрерывные проверки.
