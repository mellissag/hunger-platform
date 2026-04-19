# Hunger Beauty Platform

> Telegram-бот + Mini App + Веб-админка для салонов красоты.
> Single-tenant шаблон «под ключ»: покупаешь один раз, разворачиваешь на своём VPS.

---

## Быстрый старт

### Docker Compose (локально)

```bash
cp .env.example .env
# при необходимости отредактируйте .env
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

Точка входа: **http://localhost** (Caddy → Next.js на `/`, FastAPI на `/api`, `/healthz`, `/docs`).

### Установка на VPS (скрипт)

```bash
# Установка на чистом Ubuntu 22.04 / 24.04
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/hunger-platform/main/deploy/scripts/install.sh | bash
```

Скрипт установит Docker, клонирует репозиторий, запросит данные (домен, TG-токен, Gemini ключ) и поднимет всё за < 10 минут.

После установки: `https://your-domain.com` → панель администратора.

---

## Стек

| Слой | Технология |
|---|---|
| Backend | Python 3.12 + FastAPI + aiogram 3 |
| Frontend | Next.js 14 + TypeScript + Tailwind + shadcn/ui |
| База данных | PostgreSQL 16 + pgvector |
| Кеш / Pub/Sub | Redis 7 |
| AI | Google Gemini 1.5 Flash |
| Деплой | Docker Compose + Caddy 2 (авто-TLS) |
| CI/CD | GitHub Actions → SSH → VPS |

---

## Документация

### Спецификации

| Файл | Описание |
|---|---|
| [01_MASTER_SPEC.md](01_MASTER_SPEC.md) | Главная спека: стек, архитектура, роли, модель данных, все функции |
| [02_BOT_FLOWS.md](02_BOT_FLOWS.md) | FSM-диаграммы Telegram-бота: все сценарии, состояния, тексты |
| [03_DATABASE_SCHEMA.md](03_DATABASE_SCHEMA.md) | SQL DDL, 20 таблиц, индексы, Alembic-чеклист |
| [04_ADMIN_PANEL.md](04_ADMIN_PANEL.md) | UX-вайрфреймы всех страниц админки |
| [05_API_SPEC.md](05_API_SPEC.md) | REST API эндпоинты, схемы запросов/ответов |
| [06_CURSOR_MEGA_PROMPT.md](06_CURSOR_MEGA_PROMPT.md) | 15-фазный промпт для Cursor — генерирует всю платформу |
| [07_CURSOR_AUTOMATION.md](07_CURSOR_AUTOMATION.md) | Cursor Rules, агенты, GitHub Actions CI |
| [08_ROADMAP.md](08_ROADMAP.md) | Дорожная карта релизов |
| [GIT_DEPLOY_GUIDE.md](GIT_DEPLOY_GUIDE.md) | Git-версионирование, автотеги, SSH-деплой на VPS |

### Дизайны

Все дизайн-макеты находятся в папке [`design/`](design/):

| Файл | Описание |
|---|---|
| [design/miniapp_premium_clean.html](design/miniapp_premium_clean.html) | **Telegram Mini App** — Premium тема, без эмодзи. Dark + Light варианты рядом. 6 экранов. |
| [design/miniapp_premium.html](design/miniapp_premium.html) | Telegram Mini App — Premium тема (ранняя версия с эмодзи) |
| [design/miniapp_minimal.html](design/miniapp_minimal.html) | Telegram Mini App — Minimal тема (тёмный, синий акцент) |
| [design/miniapp_friendly.html](design/miniapp_friendly.html) | Telegram Mini App — Friendly тема (тёплый коралл) |
| [design/miniapp_variants.html](design/miniapp_variants.html) | Сравнение всех 3 тем рядом — 4 ключевых экрана |
| [design/admin_premium_light.html](design/admin_premium_light.html) | Веб-админка — Premium Light тема. Страница управления услугами. |

### Cursor-конфигурация

```
.cursor/
  rules/
    architecture.mdc   — глобальные правила архитектуры
    backend.mdc        — правила Python/FastAPI кода
    frontend.mdc       — правила Next.js/TypeScript кода
    i18n.mdc           — правила локализации (4 языка)
    security.mdc       — security checklist (OWASP)
    testing.mdc        — правила написания тестов
    git.mdc            — git workflow и теги
  agents/
    code-reviewer.md   — код-ревью после изменений
    test-writer.md     — автонаписание тестов
    i18n-checker.md    — проверка переводов
    security-auditor.md — аудит безопасности (OWASP Top 10)
    git-auto-tag.md    — автотегирование при коммите
  hooks.json           — автозапуск агентов по событиям
```

---

## Структура репозитория

```
hunger-platform/
├── backend/           Python: FastAPI + aiogram + ARQ
├── frontend/          Next.js: admin panel + mini app
├── deploy/            Docker Compose, Caddy, скрипты
├── .github/workflows/ CI (ci.yml) + CD (deploy.yml)
├── .cursor/           Cursor Rules + Agents
├── docs/              Руководства (INSTALL, ADMIN, MASTER)
├── design/            HTML-макеты (просматривай в браузере)
├── .pre-commit-config.yaml
└── README.md          ← ты здесь
```

---

## Разработка с Cursor

1. Открой папку проекта в Cursor.
2. Cursor автоматически подхватит `.cursor/rules/*.mdc`.
3. Открой `06_CURSOR_MEGA_PROMPT.md` — там 15 фаз для генерации всей платформы.
4. Вставляй фазы в Cursor Composer **по одной**.
5. После каждой фазы — `git add -A && git commit -m "feat(phase-N): ..."`.

**Агенты** (вызывай через `@` в Cursor Composer):
- `@code-reviewer` — код-ревью текущих изменений
- `@test-writer` — написать тесты для нового кода
- `@i18n-checker` — проверить синхронность переводов
- `@security-auditor` — аудит безопасности
- `@git-auto-tag` — создать коммит и предложить тег

---

## Роли

| Роль | Возможности |
|---|---|
| **Owner** | Полный доступ: все функции + настройки + сотрудники |
| **Admin** | Всё кроме настроек салона и управления сотрудниками |
| **Master** | Только свои брони, расписание, клиенты, статистика |
| **Reception** | Брони, клиенты, расписание (read only), услуги (read only) |

---

## CI/CD

- **Push в `dev`** → CI (lint + typecheck + test)
- **Merge в `main`** → CI → Docker build → SSH деплой на VPS → автотег `ver{X}.{Y} — описание`

Подробности: [GIT_DEPLOY_GUIDE.md](GIT_DEPLOY_GUIDE.md)

GitHub Secrets для деплоя:

| Secret | Значение |
|---|---|
| `VPS_HOST` | IP или домен VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Приватный ed25519 ключ |
| `VPS_PORT` | `22` |

---

## Telegram Mini App — дизайн

Выбранная тема: **Premium** (Gold × Black / Gold × Ivory).

- Шрифты: Cormorant Garamond (заголовки) + Inter (тело)
- Акцент Dark: `#C9A84C` / Light: `#9A7230`
- border-radius: 2px везде (острая, люксовая эстетика)
- Иконки: SVG only (без эмодзи)
- MainButton: золотой градиент, uppercase

Открой [`design/miniapp_premium_clean.html`](design/miniapp_premium_clean.html) в браузере — оба варианта рядом.

---

## Контакты / Лицензия

Single-tenant лицензия. Один комплект исходников = один салон.
Вопросы: внутренняя документация в папке `docs/`.
