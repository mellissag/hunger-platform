# Git & Deploy Guide — Hunger Platform

> Полное руководство по версионированию, автотегированию и CI/CD-деплою на VPS через GitHub Actions + SSH.

---

## Содержание

1. [Концепция версионирования](#1-концепция-версионирования)
2. [Структура репозитория и .gitignore](#2-структура-репозитория-и-gitignore)
3. [Автоматическое тегирование (ver1.0 — описание)](#3-автоматическое-тегирование)
4. [GitHub Actions — CI pipeline](#4-github-actions--ci-pipeline)
5. [GitHub Actions — CD: деплой на VPS по SSH](#5-github-actions--cd-деплой-на-vps-по-ssh)
6. [Подготовка VPS к деплою](#6-подготовка-vps-к-деплою)
7. [Переменные окружения и секреты](#7-переменные-окружения-и-секреты)
8. [Полный цикл: от коммита до боевого сервера](#8-полный-цикл-от-коммита-до-боевого-сервера)
9. [Откат на предыдущую версию](#9-откат-на-предыдущую-версию)
10. [Cursor-агент: git-автоматизация](#10-cursor-агент-git-автоматизация)

---

## 1. Концепция версионирования

### 1.1. Формат тегов

```
ver{MAJOR}.{MINOR} — {краткое описание изменений}
```

Примеры:
```
ver1.0 — initial release
ver1.1 — добавлены услуги CRUD и Redis sync
ver1.2 — исправлен баг с отменой записи
ver2.0 — Multi-language admin panel
```

Тег создаётся **автоматически** при каждом merge в ветку `main`.

### 1.2. Ветки

| Ветка | Назначение |
|---|---|
| `main` | Стабильный код, только через PR. Push сюда = деплой на VPS. |
| `dev` | Основная рабочая ветка. Сюда идут все изменения. |
| `feature/*` | Фичи. Merge → dev → main. |
| `fix/*` | Баг-фиксы. Merge → dev → main (или напрямую в main для хотфиксов). |
| `release/*` | Опционально для подготовки крупных релизов. |

### 1.3. Что трекается в git

**Всё** — включая:
- `backend/` — весь Python-код
- `frontend/` — весь Next.js-код
- `deploy/` — docker-compose, Caddyfile, скрипты
- `.github/workflows/` — CI/CD
- `.cursor/` — правила и агенты Cursor
- `docs/` — документация
- `design/` — HTML-дизайны (и этот файл тоже)
- `*.md` — все спеки и гайды

**НЕ трекается** (в `.gitignore`):
- `.env`, `.env.*` — секреты
- `node_modules/`, `__pycache__/`, `.venv/`
- `*.pyc`, `*.pyo`
- `build/`, `.next/`, `dist/`
- `data/` — PostgreSQL/Redis volumes
- `uploads/` — файлы загруженные пользователями
- `*.log`
- `.DS_Store`

---

## 2. Структура репозитория и .gitignore

Файл `.gitignore` в корне репозитория:

```gitignore
# ── Secrets ──────────────────────────────────────────────
.env
.env.*
!.env.example

# ── Python ───────────────────────────────────────────────
__pycache__/
*.py[cod]
*.pyo
.venv/
venv/
.mypy_cache/
.ruff_cache/
.pytest_cache/
htmlcov/
.coverage
coverage.xml

# ── Node / Next.js ───────────────────────────────────────
node_modules/
.next/
out/
dist/
.npm/
*.tsbuildinfo
next-env.d.ts

# ── Docker volumes / runtime data ────────────────────────
data/
uploads/
backups/

# ── Logs ─────────────────────────────────────────────────
*.log
logs/

# ── OS ───────────────────────────────────────────────────
.DS_Store
Thumbs.db

# ── IDE ──────────────────────────────────────────────────
.idea/
.vscode/
*.swp
*.swo
```

---

## 3. Автоматическое тегирование

### 3.1. Скрипт `deploy/scripts/tag_version.sh`

Этот скрипт запускается GitHub Actions при каждом push в `main`. Он:
1. Читает последний существующий тег формата `ver*`.
2. Инкрементирует минорную версию.
3. Берёт тему коммита как описание.
4. Создаёт и пушит тег.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Получить последний тег формата ver*.* или ver*.*.*
LAST_TAG=$(git tag --list 'ver*' --sort=-version:refname | head -n1)

if [[ -z "$LAST_TAG" ]]; then
  MAJOR=1
  MINOR=0
else
  # Извлечь только числовую часть (до " — ")
  VERSION_PART=$(echo "$LAST_TAG" | grep -oP 'ver\K[\d.]+')
  MAJOR=$(echo "$VERSION_PART" | cut -d. -f1)
  MINOR=$(echo "$VERSION_PART" | cut -d. -f2)
  MINOR=$((MINOR + 1))
fi

# Описание — тема последнего коммита
COMMIT_MSG=$(git log -1 --format="%s")
# Убрать потенциально опасные символы для тега
SAFE_DESC=$(echo "$COMMIT_MSG" | sed 's/[^a-zA-Z0-9а-яА-ЯёЁ _\-\(\)]//g' | head -c 80)

NEW_TAG="ver${MAJOR}.${MINOR} — ${SAFE_DESC}"

echo "Creating tag: $NEW_TAG"
git tag "$NEW_TAG"
git push origin "$NEW_TAG"
```

### 3.2. Ручное тегирование (при необходимости)

```bash
# Создать тег вручную
git tag "ver1.3 — добавил рассылки по сегментам"
git push origin "ver1.3 — добавил рассылки по сегментам"

# Посмотреть все теги
git tag --list 'ver*' --sort=-version:refname

# Удалить тег (если ошибся)
git tag -d "ver1.3 — добавил рассылки по сегментам"
git push origin --delete "ver1.3 — добавил рассылки по сегментам"
```

---

## 4. GitHub Actions — CI pipeline

Файл `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [dev, main]
  pull_request:
    branches: [main]

jobs:
  backend:
    name: Backend — lint, typecheck, test
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: hunger_test
          POSTGRES_USER: hunger
          POSTGRES_PASSWORD: testpass
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip

      - name: Install dependencies
        run: pip install -e ".[dev]"

      - name: Lint (ruff)
        run: ruff check .

      - name: Format check (black)
        run: black --check .

      - name: Type check (mypy)
        run: mypy app/

      - name: Run tests
        env:
          DATABASE_URL: postgresql+asyncpg://hunger:testpass@localhost:5432/hunger_test
          REDIS_URL: redis://localhost:6379/0
          SECRET_KEY: ci-test-secret
          JWT_SECRET: ci-test-jwt
        run: pytest --cov=app --cov-report=xml -q

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: coverage.xml
        continue-on-error: true

  frontend:
    name: Frontend — lint, typecheck, test, build
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint (ESLint)
        run: npm run lint

      - name: Format check (Prettier)
        run: npm run format:check

      - name: Type check (tsc)
        run: npm run typecheck

      - name: Unit tests (Vitest)
        run: npm run test:run

      - name: Build (Next.js)
        run: npm run build
        env:
          NEXT_PUBLIC_API_URL: http://localhost:8000

  docker-build:
    name: Build Docker images
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push backend image
        uses: docker/build-push-action@v5
        with:
          context: backend
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/backend:latest
            ghcr.io/${{ github.repository }}/backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push frontend image
        uses: docker/build-push-action@v5
        with:
          context: frontend
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/frontend:latest
            ghcr.io/${{ github.repository }}/frontend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## 5. GitHub Actions — CD: деплой на VPS по SSH

Файл `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false   # не отменять деплой если пришёл ещё один push

jobs:
  deploy:
    name: Deploy & auto-tag
    runs-on: ubuntu-latest
    needs: []   # запускается параллельно с CI, но SSH-шаг ждёт его успеха

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # нужно для тегов

      - name: Wait for CI to pass
        uses: lewagon/wait-on-check-action@v1.3.4
        with:
          ref: ${{ github.sha }}
          check-name: "Backend — lint, typecheck, test"
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          wait-interval: 15

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Auto-tag version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          chmod +x deploy/scripts/tag_version.sh
          ./deploy/scripts/tag_version.sh

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT }}
          script: |
            set -e
            cd /opt/hunger-platform

            echo "==> Pulling latest code..."
            git fetch --all --tags
            git checkout main
            git pull origin main

            echo "==> Logging in to GHCR..."
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io \
              -u ${{ github.actor }} --password-stdin

            echo "==> Pulling new images..."
            docker compose -f docker-compose.yml \
                           -f docker-compose.prod.yml pull

            echo "==> Restarting services (zero-downtime)..."
            docker compose -f docker-compose.yml \
                           -f docker-compose.prod.yml \
                           up -d --build --remove-orphans

            echo "==> Running DB migrations..."
            docker compose exec -T api \
              alembic upgrade head

            echo "==> Health check..."
            sleep 5
            curl -sf http://localhost:8000/healthz || \
              (echo "Health check FAILED" && exit 1)

            echo "==> Deploy complete!"
            docker compose ps
```

---

## 6. Подготовка VPS к деплою

### 6.1. Первоначальная настройка (выполняется один раз вручную)

```bash
# 1. Подключиться к VPS
ssh root@YOUR_VPS_IP

# 2. Создать деплой-пользователя
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
# Скопировать публичный ключ из GitHub Actions секрета
echo "PUBLIC_KEY_HERE" >> /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# 3. Установить Docker
apt update && apt install -y docker.io docker-compose-plugin git
systemctl enable docker

# 4. Клонировать репозиторий
mkdir -p /opt/hunger-platform
chown deploy:deploy /opt/hunger-platform
su - deploy
cd /opt/hunger-platform
git clone https://github.com/YOUR_ORG/hunger-platform.git .

# 5. Создать .env из примера
cp deploy/.env.example deploy/.env
nano deploy/.env   # заполнить реальные значения

# 6. Первый запуск
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec api alembic upgrade head
```

### 6.2. SSH-ключ для GitHub Actions

```bash
# На локальной машине (или на VPS) — создать пару ключей
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/hunger_deploy

# Приватный ключ → GitHub Secret VPS_SSH_KEY
cat ~/.ssh/hunger_deploy

# Публичный ключ → добавить в /home/deploy/.ssh/authorized_keys на VPS
cat ~/.ssh/hunger_deploy.pub
```

### 6.3. Структура директории на VPS

```
/opt/hunger-platform/
├── docker-compose.yml          (из репозитория)
├── docker-compose.prod.yml     (из репозитория)
├── deploy/
│   ├── .env                    (НЕ в git — создаётся вручную)
│   ├── Caddyfile
│   └── scripts/
├── data/                       (volumes — НЕ в git)
│   ├── postgres/
│   └── redis/
└── uploads/                    (НЕ в git)
```

---

## 7. Переменные окружения и секреты

### 7.1. GitHub Repository Secrets

Добавить в: `Settings → Secrets and variables → Actions → New repository secret`

| Secret | Значение |
|---|---|
| `VPS_HOST` | IP или домен VPS (например `123.45.67.89`) |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Содержимое приватного ключа `~/.ssh/hunger_deploy` |
| `VPS_PORT` | `22` (или кастомный) |

`GITHUB_TOKEN` — создаётся автоматически, ничего настраивать не нужно.

### 7.2. Файл `.env` на VPS

```dotenv
# ── Telegram ─────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=7123456789:AABbbCCdd...
TELEGRAM_WEBHOOK_SECRET=random_secret_string_here

# ── Database ─────────────────────────────────────────────
POSTGRES_DB=hunger
POSTGRES_USER=hunger
POSTGRES_PASSWORD=supersecurepassword123
DATABASE_URL=postgresql+asyncpg://hunger:supersecurepassword123@postgres:5432/hunger

# ── Redis ────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── Security ─────────────────────────────────────────────
SECRET_KEY=your-64-char-random-string-here
JWT_SECRET=another-64-char-random-string

# ── App ──────────────────────────────────────────────────
APP_DOMAIN=beauty.yourdomain.com
APP_ENV=production
DEBUG=false

# ── AI ───────────────────────────────────────────────────
GEMINI_API_KEY=AIzaSy...

# ── Email (optional) ─────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=app_password_here
```

Генерация случайных ключей:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 7.2.1 Обновить только `.env` на VPS (актуальные секреты / WhatsApp и т.д.)

Файл `.env` **не в git** — CI при push в `main` **не копирует** его на сервер. Чтобы на VPS лежала та же версия, что у вас локально:

1. Убедитесь, что в корне репозитория заполнён `.env` (или задайте `ENV_FILE=...`).
2. С машины с SSH-ключом к VPS:
   ```bash
   cd /path/to/hunger-platform
   chmod +x deploy/scripts/push-env-to-vps.sh
   export VPS_HOST=your.server.tld
   export VPS_USER=deploy
   export VPS_SSH_KEY=$HOME/.ssh/your_deploy_key   # при необходимости
   export VPS_PORT=22
   ./deploy/scripts/push-env-to-vps.sh
   ```
3. Скрипт копирует `.env` в `${VPS_APP_DIR:-/opt/hunger-platform}/.env` и выполняет `docker compose ... up -d` (как в `.github/workflows/deploy.yml`), чтобы контейнеры подхватили новые переменные.

Если на сервере **нет** overlay `docker-compose.prod.yml`, задайте `VPS_USE_PROD_OVERLAY=0`.

---

## 8. Полный цикл: от коммита до боевого сервера

### 8.1. Нормальная разработка (фича)

```bash
# 1. Создать ветку
git checkout dev
git pull origin dev
git checkout -b feature/services-crud

# 2. Работать, коммитить
git add .
git commit -m "feat: добавил CRUD для услуг с Redis sync"

# 3. Push и PR в dev
git push origin feature/services-crud
# Открыть PR на GitHub: feature/services-crud → dev

# 4. После merge в dev → PR: dev → main
# CI запускается автоматически при push в main
# После успешного CI → деплой на VPS
# Тег создаётся автоматически: "ver1.1 — feat: добавил CRUD для услуг с Redis sync"
```

### 8.2. Хотфикс (прямо в main)

```bash
git checkout main
git pull origin main
git checkout -b fix/booking-cancel-bug
# ... исправить ...
git add .
git commit -m "fix: исправлена отмена записи при null cancellation_free_hours"
git push origin fix/booking-cancel-bug
# PR: fix/... → main (без dev, срочно)
```

### 8.3. Что происходит автоматически при merge в main

```
1. GitHub Actions запускает ci.yml
   ├─ Backend: ruff → black → mypy → pytest
   ├─ Frontend: eslint → prettier → tsc → vitest → next build
   └─ Docker: build + push to ghcr.io

2. GitHub Actions запускает deploy.yml
   ├─ Ждёт успешного CI
   ├─ Создаёт тег: "ver1.2 — fix: исправлена отмена записи"
   └─ SSH на VPS:
       ├─ git pull origin main
       ├─ docker compose pull (скачать новые образы)
       ├─ docker compose up -d --build
       ├─ alembic upgrade head
       └─ curl /healthz — проверить что всё работает
```

### 8.4. Мониторинг деплоя

После каждого деплоя смотреть логи:

```bash
# Подключиться к VPS
ssh deploy@YOUR_VPS_IP

# Логи всех контейнеров
docker compose -f /opt/hunger-platform/docker-compose.yml logs -f --tail=50

# Логи конкретного контейнера
docker compose logs -f api
docker compose logs -f web

# Статус
docker compose ps
```

---

## 9. Откат на предыдущую версию

### 9.1. Через тег

```bash
# На VPS: откатиться на конкретный тег
ssh deploy@YOUR_VPS_IP
cd /opt/hunger-platform

# Посмотреть теги
git tag --list 'ver*' --sort=-version:refname | head -10

# Откатиться
git checkout "ver1.0 — initial release"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec api alembic downgrade -1   # откат миграции, если нужно
```

### 9.2. Откат миграции БД

```bash
# Посмотреть историю миграций
docker compose exec api alembic history --verbose

# Откатить последнюю
docker compose exec api alembic downgrade -1

# Откатить до конкретной ревизии
docker compose exec api alembic downgrade abc123def
```

**Важно:** всегда сначала откатывай код, потом миграцию. Никогда — наоборот.

---

## 10. Cursor-агент: git-автоматизация

Файл `.cursor/agents/git-auto-tag.md`:

```markdown
# Git Auto-Tag Agent

## Цель
После каждого значимого изменения кода — создать коммит с понятным описанием и предложить тег.

## Правила
1. Перед коммитом — `git status` и `git diff --stat`, чтобы увидеть что изменилось.
2. Сообщение коммита: `тип: краткое описание` (feat/fix/refactor/docs/style/test/chore).
   Примеры:
   - `feat: добавлен экран подтверждения в Mini App`
   - `fix: исправлен race condition в Redis Pub/Sub`
   - `docs: обновлена спека по услугам`
3. Добавлять ВСЕ изменённые файлы (`git add -A`) — включая документацию, дизайны, конфиги.
4. После коммита предложить тег в формате `ver{X}.{Y} — {сообщение коммита}`.
5. НЕ пушить автоматически — спросить разработчика.

## Команды
\`\`\`bash
git add -A
git commit -m "feat: ..."
git tag "ver1.2 — feat: ..."
git push origin main --follow-tags
\`\`\`

## Когда запускать
- После завершения фичи (merge в dev или main).
- После исправления бага.
- После обновления документации или дизайнов.
```

Файл `.cursor/rules/git.mdc`:

```
---
description: Git workflow rules
globs: ["**/*"]
alwaysApply: true
---

# Git Rules

- Commit messages must follow: `type: short description` (EN or RU).
- Types: feat | fix | refactor | docs | style | test | chore | deploy.
- Always `git add -A` to include ALL project files (docs, designs, configs).
- Never commit .env files.
- Tags format: `ver{X}.{Y} — {commit message}` (auto-incremented minor).
- Push with `--follow-tags` to include tags.
- After merge to main: CI runs automatically, deploy happens via GitHub Actions.
```

---

## Шпаргалка — частые команды

```bash
# Посмотреть статус
git status
git log --oneline --graph --all | head -20

# Все теги с датами
git log --tags --simplify-by-decoration --pretty="format:%d — %ai" | head -20

# Что изменилось с последнего тега
git diff $(git describe --tags --abbrev=0)..HEAD --stat

# Вручную создать тег и запушить
git tag "ver1.5 — новая функция"
git push origin "ver1.5 — новая функция"

# Удалённые ветки — очистить устаревшие
git remote prune origin
git branch -d feature/old-branch

# Проверить что CI успешен перед merge
gh pr checks   # через GitHub CLI
```

---

*Конец GIT_DEPLOY_GUIDE.md — создан 2026-04-19*
