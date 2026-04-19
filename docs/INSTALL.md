# Установка Hunger Beauty Platform

> Шаблон платформы для салонов красоты: Telegram-бот + веб-админка + Mini App.

---

## Содержание

1. [Требования](#1-требования)
2. [DNS-настройка](#2-dns-настройка)
3. [Быстрая установка (one-liner)](#3-быстрая-установка-one-liner)
4. [Ручная установка](#4-ручная-установка)
5. [Пост-установочная конфигурация](#5-пост-установочная-конфигурация)
6. [Telegram-бот: настройка](#6-telegram-бот-настройка)
7. [Автоматические бэкапы](#7-автоматические-бэкапы)
8. [Обновление до новой версии](#8-обновление-до-новой-версии)
9. [Управление сервисами](#9-управление-сервисами)
10. [Откат на предыдущую версию](#10-откат-на-предыдущую-версию)
11. [Устранение неполадок](#11-устранение-неполадок)

---

## 1. Требования

### Сервер (VPS)

| Параметр | Минимум | Рекомендуется |
|---|---|---|
| ОС | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 2 GB | 4 GB |
| Диск | 20 GB SSD | 40+ GB SSD |
| Порты | 80/TCP, 443/TCP открыты | |

### Внешние сервисы

| Сервис | Обязательно | Где получить |
|---|---|---|
| Домен с A-записью | Да | Любой регистратор |
| Telegram Bot Token | Да | [@BotFather](https://t.me/BotFather) |
| Google Gemini API Key | Нет (AI-консультант) | [Google AI Studio](https://aistudio.google.com) |

---

## 2. DNS-настройка

Перед установкой создайте A-запись у вашего DNS-провайдера:

```
Тип: A
Имя: beauty (или @, www, subdomain)
Значение: <IP вашего VPS>
TTL: 300 (или минимально доступный)
```

Дождитесь распространения DNS (обычно 5–30 минут):

```bash
# Проверка
dig beauty.example.com +short
# Должен вернуть IP вашего VPS
```

---

## 3. Быстрая установка (one-liner)

Выполните на чистом Ubuntu **от имени root**:

```bash
curl -fsSL https://github.com/hunger-platform/hunger-beauty/releases/latest/download/install.sh | sudo bash
```

Скрипт запросит:
1. **Домен** — например `beauty.example.com`
2. **Email** — для уведомлений Let's Encrypt
3. **Telegram Bot Token** — из @BotFather
4. **Gemini API Key** — (опционально, Enter для пропуска)

Установка занимает **5–10 минут**. В конце выводится:

```
╔══════════════════════════════════════════════════════════╗
║                ✅  УСТАНОВКА ЗАВЕРШЕНА!                   ║
║                                                           ║
║  Панель управления:                                       ║
║  → https://beauty.example.com/login                      ║
║                                                           ║
║  Логин:   owner@adm-test.tech                             ║
║  Пароль:  [случайный пароль]                              ║
╚══════════════════════════════════════════════════════════╝
```

---

## 4. Ручная установка

### 4.1. Установка Docker

```bash
apt-get update
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

### 4.2. Клонирование репозитория

```bash
git clone https://github.com/hunger-platform/hunger-beauty.git /opt/hunger-platform
cd /opt/hunger-platform

# Переключиться на последний релиз
LATEST=$(git tag --list 'v*' --sort=-version:refname | head -1)
git checkout "$LATEST"
```

### 4.3. Создание .env

```bash
cp .env.example .env
nano .env
```

Обязательные поля в `.env`:

```dotenv
APP_DOMAIN=beauty.example.com
LETSENCRYPT_EMAIL=you@example.com
PUBLIC_APP_URL=https://beauty.example.com

TELEGRAM_BOT_TOKEN=1234567890:AABBccDDee...
TELEGRAM_WEBHOOK_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

POSTGRES_PASSWORD=$(python3 -c "import secrets; print(secrets.token_hex(32))")
DATABASE_URL=postgresql+asyncpg://hunger:${POSTGRES_PASSWORD}@postgres:5432/hunger

SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

SEED_PASSWORD=$(python3 -c "import secrets; print(secrets.token_hex(16))")

GITHUB_REPOSITORY=hunger-platform/hunger-beauty
IMAGE_TAG=latest
```

### 4.4. Запуск сервисов

```bash
cd /opt/hunger-platform

# Загрузить pre-built образы
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
               --env-file .env pull

# Запустить
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
               --env-file .env up -d
```

### 4.5. Применение миграций

```bash
# Дождитесь готовности PostgreSQL (~10 сек)
docker compose exec postgres pg_isready -U hunger

# Применить миграции
docker compose exec api alembic upgrade head
```

### 4.6. Инициализация данных

```bash
docker compose exec api python -m scripts.seed_init
```

### 4.7. Настройка Telegram webhook

```bash
# Замените переменные из .env
source .env
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://${APP_DOMAIN}/api/v1/tg/webhook/${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query","pre_checkout_query"]'
```

---

## 5. Пост-установочная конфигурация

### 5.1. Первый вход

1. Откройте `https://your-domain/login`
2. Логин: `owner@adm-test.tech`
3. Пароль: из переменной `SEED_PASSWORD` в `.env` (или из вывода install.sh)

### 5.2. Обязательные настройки (Settings → Салон)

- [ ] Смените email и пароль owner-аккаунта (Settings → Сотрудники)
- [ ] Укажите название салона, описание, логотип
- [ ] Установите временную зону и валюту
- [ ] Добавьте рабочие часы по умолчанию

### 5.3. Создание контента

- [ ] Добавьте категории и услуги (Services)
- [ ] Добавьте мастеров с фото и специализацией (Masters)
- [ ] Привяжите мастеров к услугам
- [ ] Заполните базу знаний для AI (AI → База знаний)

### 5.4. Firewall (UFW)

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## 6. Telegram-бот: настройка

### 6.1. Создание бота

1. Откройте [@BotFather](https://t.me/BotFather)
2. Отправьте `/newbot`
3. Введите имя бота и username (должен оканчиваться на `bot`)
4. Скопируйте Token

### 6.2. Настройка Mini App

В BotFather:
```
/newapp → выберите бота → укажите URL: https://your-domain/mini-app
```

### 6.3. Webhook

Webhook устанавливается автоматически при установке. Для ручной установки:

```bash
source /opt/hunger-platform/.env
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://${APP_DOMAIN}/api/v1/tg/webhook/${TELEGRAM_WEBHOOK_SECRET}"
```

Проверка:
```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

---

## 7. Автоматические бэкапы

Cron настраивается автоматически при install.sh (ежедневно в 03:00).

Ручной бэкап:
```bash
bash /opt/hunger-platform/deploy/scripts/backup.sh
```

Бэкапы сохраняются в `/opt/hunger-platform/backups/`:
- `daily/` — 7 ежедневных
- `weekly/` — 4 еженедельных (каждое воскресенье)
- `monthly/` — 3 ежемесячных (1-го числа)

### Восстановление из бэкапа

```bash
cd /opt/hunger-platform

# Определить имя бэкапа
ls backups/daily/

# Остановить API (чтобы не было активных соединений)
docker compose exec api bash -c "kill 1" || true

# Восстановить
gunzip -c backups/daily/hunger_20260120_030000.sql.gz | \
  docker compose exec -T postgres \
    pg_restore -U hunger -d hunger --clean --if-exists

# Перезапустить
docker compose up -d api worker
```

---

## 8. Обновление до новой версии

```bash
# Автоматическое обновление до последней версии
bash /opt/hunger-platform/deploy/scripts/update.sh

# Обновление до конкретной версии
bash /opt/hunger-platform/deploy/scripts/update.sh v1.3.0
```

Скрипт автоматически:
1. Создаёт бэкап
2. Переключается на новый тег
3. Загружает новые образы
4. Перезапускает сервисы
5. Применяет миграции

---

## 9. Управление сервисами

```bash
cd /opt/hunger-platform

# Псевдоним для удобства
alias dc='docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml --env-file .env'

# Статус всех сервисов
dc ps

# Логи
dc logs -f api       # API + бот
dc logs -f web       # Next.js
dc logs -f worker    # ARQ worker
dc logs -f caddy     # Reverse proxy

# Перезапуск сервиса
dc restart api

# Полная остановка
dc down

# Полная остановка с удалением volumes (ДАННЫЕ БУДУТ УДАЛЕНЫ!)
dc down -v
```

---

## 10. Откат на предыдущую версию

```bash
cd /opt/hunger-platform

# Просмотр доступных версий
git tag --list 'v*' --sort=-version:refname | head -10

# Откат к версии
git checkout v1.1.0

# Остановить и пересобрать
docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
               --env-file .env pull

docker compose -f deploy/docker-compose.yml \
               -f deploy/docker-compose.prod.yml \
               --env-file .env up -d

# Откатить миграции (если нужно)
docker compose exec api alembic downgrade -1
```

---

## 11. Устранение неполадок

### Сервис не запускается

```bash
# Проверить статус
docker compose ps

# Логи с подробностями
docker compose logs api --tail=100
docker compose logs caddy --tail=50
```

### HTTPS не работает

```bash
# Проверить DNS
dig your-domain +short

# Проверить Caddy
docker compose logs caddy --tail=50

# Тест Let's Encrypt
curl -v https://your-domain/healthz
```

Caddy автоматически получает сертификат при первом запросе. Убедитесь:
- DNS A-запись направлена на IP этого сервера
- Порты 80 и 443 открыты
- Email указан правильно в `.env` (LETSENCRYPT_EMAIL)

### PostgreSQL недоступен

```bash
docker compose exec postgres pg_isready -U hunger
docker compose logs postgres --tail=50
```

### Telegram webhook не работает

```bash
source .env
# Проверить статус webhook
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# Переустановить webhook
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://${APP_DOMAIN}/api/v1/tg/webhook/${TELEGRAM_WEBHOOK_SECRET}"
```

### Healthcheck

```bash
# API
curl -I https://your-domain/healthz

# Database check
docker compose exec api python -c "
import asyncio
from app.db.session import get_engine
async def check():
    e = get_engine()
    async with e.connect() as c:
        await c.execute('SELECT 1')
    print('DB OK')
asyncio.run(check())
"
```

### Просмотр использования ресурсов

```bash
docker stats --no-stream
```

---

*Документация актуальна для версии v1.x.x. Обновлено: 2026-04-19.*
