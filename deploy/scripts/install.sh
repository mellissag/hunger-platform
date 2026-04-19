#!/usr/bin/env bash
# =============================================================================
# Hunger Beauty Platform — Install Script
# =============================================================================
# Использование (от root):
#   curl -fsSL https://github.com/OWNER/REPO/releases/latest/download/install.sh | sudo bash
#
# Требования: Ubuntu 22.04 / 24.04, открытые порты 80/443, домен с A-записью на VPS.
# =============================================================================
set -euo pipefail

# ── Настройки (переопределяются переменными среды) ────────────────────────────
: "${GHCR_REPO:=ghcr.io/hunger-platform/hunger-beauty}"
: "${IMAGE_TAG:=latest}"
: "${REPO_URL:=https://github.com/hunger-platform/hunger-beauty.git}"
: "${INSTALL_DIR:=/opt/hunger-platform}"
: "${LOG_FILE:=/tmp/hunger-install.log}"

# ── Цвета ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
info() { echo -e "${BLUE}[i]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
die()  { err "$*"; exit 1; }

step() {
  echo ""
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $*${NC}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════════${NC}"
}

banner() {
  echo -e "${BLUE}${BOLD}"
  echo "╔══════════════════════════════════════════════╗"
  echo "║    Hunger Beauty Platform — Installer v1.0   ║"
  echo "║    Telegram Bot + Web Admin + Mini App       ║"
  echo "╚══════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo "  Лог установки: ${LOG_FILE}"
  echo ""
}

gen_hex() { python3 -c "import secrets; print(secrets.token_hex(32))"; }
gen_pass() {
  python3 -c "
import secrets, string
chars = string.ascii_letters + string.digits + '_@#'
print(''.join(secrets.choice(chars) for _ in range(18)))
"
}

# ── Preflight ────────────────────────────────────────────────────────────────
check_root() {
  [[ $EUID -eq 0 ]] || die "Запустите от root: sudo bash install.sh"
}

check_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
      warn "Поддерживается Ubuntu 22.04/24.04. Текущая ОС: $PRETTY_NAME. Продолжаю..."
    fi
  fi
}

check_ports() {
  for port in 80 443; do
    if ss -tlnp "sport = :${port}" 2>/dev/null | grep -q LISTEN; then
      die "Порт ${port} уже занят. Освободите его перед установкой."
    fi
  done
  log "Порты 80 и 443 свободны"
}

# ── Docker install ────────────────────────────────────────────────────────────
install_docker() {
  step "Установка Docker"

  if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') уже установлен"
    return
  fi

  info "Устанавливаю Docker Engine..."
  apt-get update -qq 2>>"${LOG_FILE}"
  apt-get install -y -qq ca-certificates curl gnupg 2>>"${LOG_FILE}"

  # Official Docker GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Docker repo
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq 2>>"${LOG_FILE}"
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin 2>>"${LOG_FILE}"

  systemctl enable --now docker 2>>"${LOG_FILE}"
  log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') установлен"
}

# ── Clone repo ────────────────────────────────────────────────────────────────
clone_repo() {
  step "Клонирование репозитория"

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    warn "Директория ${INSTALL_DIR} уже существует — обновляю..."
    cd "${INSTALL_DIR}"
    git fetch --all --tags --quiet 2>>"${LOG_FILE}"
  else
    info "Клонирую в ${INSTALL_DIR}..."
    mkdir -p "$(dirname "${INSTALL_DIR}")"
    git clone --quiet "${REPO_URL}" "${INSTALL_DIR}" 2>>"${LOG_FILE}"
    cd "${INSTALL_DIR}"
  fi

  # Checkout latest semver tag
  LATEST_TAG=$(git tag --list 'v*' --sort=-version:refname 2>/dev/null | head -n1 || true)
  if [[ -n "${LATEST_TAG}" ]]; then
    info "Переключаюсь на последний релиз: ${LATEST_TAG}"
    git checkout --quiet "${LATEST_TAG}" 2>>"${LOG_FILE}"
    log "Версия: ${LATEST_TAG}"
  else
    warn "Теги vX.Y.Z не найдены — использую HEAD"
  fi
}

# ── Interactive config ─────────────────────────────────────────────────────────
prompt_config() {
  step "Настройка платформы"
  echo ""
  echo "  Для работы необходимы:"
  echo "  • Домен с A-записью, направленной на этот сервер"
  echo "  • Telegram-бот (создать через @BotFather)"
  echo "  • Google Gemini API Key (необязательно, для AI-консультанта)"
  echo ""

  while true; do
    read -rp "  Домен (например beauty.example.com): " DOMAIN
    [[ -n "${DOMAIN}" ]] && break
    err "  Домен обязателен"
  done

  while true; do
    read -rp "  Email для Let's Encrypt уведомлений: " LETSENCRYPT_EMAIL
    [[ "${LETSENCRYPT_EMAIL}" == *@* ]] && break
    err "  Введите корректный email"
  done

  while true; do
    read -rp "  Telegram Bot Token (из @BotFather): " TG_TOKEN
    [[ -n "${TG_TOKEN}" ]] && break
    err "  Telegram Bot Token обязателен"
  done

  read -rp "  Google Gemini API Key (Enter — пропустить): " GEMINI_KEY
  GEMINI_KEY="${GEMINI_KEY:-}"

  echo ""
}

# ── Generate .env ──────────────────────────────────────────────────────────────
generate_env() {
  step "Генерация .env"

  OWNER_PASSWORD=$(gen_pass)
  DB_PASSWORD=$(gen_hex)
  SECRET_KEY=$(gen_hex)
  JWT_SECRET=$(gen_hex)
  TG_WEBHOOK_SECRET=$(gen_hex)

  ENV_FILE="${INSTALL_DIR}/.env"

  cat > "${ENV_FILE}" << EOF
# ── Сгенерировано install.sh — $(date -u +"%Y-%m-%dT%H:%M:%SZ") ──────────────
# НЕ КОММИТИТЬ В GIT!

# ── Приложение ──────────────────────────────────────────────────────────────
APP_DOMAIN=${DOMAIN}
PUBLIC_APP_URL=https://${DOMAIN}
APP_ENV=production
DEBUG=false

# ── Let's Encrypt ────────────────────────────────────────────────────────────
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}

# ── Telegram ─────────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=${TG_TOKEN}
TELEGRAM_WEBHOOK_SECRET=${TG_WEBHOOK_SECRET}

# ── PostgreSQL ───────────────────────────────────────────────────────────────
POSTGRES_DB=hunger
POSTGRES_USER=hunger
POSTGRES_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql+asyncpg://hunger:${DB_PASSWORD}@postgres:5432/hunger

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── JWT / Безопасность ────────────────────────────────────────────────────────
SECRET_KEY=${SECRET_KEY}
JWT_SECRET=${JWT_SECRET}

# ── Google Gemini AI ──────────────────────────────────────────────────────────
GEMINI_API_KEY=${GEMINI_KEY}

# ── Seed (первый запуск) ──────────────────────────────────────────────────────
SEED_PASSWORD=${OWNER_PASSWORD}

# ── Docker / GHCR ─────────────────────────────────────────────────────────────
# Установите GITHUB_REPOSITORY = owner/repo-name вашего форка, если собираете сами
GITHUB_REPOSITORY=hunger-platform/hunger-beauty
IMAGE_TAG=${IMAGE_TAG}

# ── SMTP (опционально) ────────────────────────────────────────────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EOF

  chmod 600 "${ENV_FILE}"
  log ".env сгенерирован: ${ENV_FILE}"
}

# ── Compose helpers ────────────────────────────────────────────────────────────
COMPOSE_FILES="-f ${INSTALL_DIR}/deploy/docker-compose.yml -f ${INSTALL_DIR}/deploy/docker-compose.prod.yml"
COMPOSE_OPTS="--env-file ${INSTALL_DIR}/.env"

dc() {
  # shellcheck disable=SC2086
  docker compose ${COMPOSE_FILES} ${COMPOSE_OPTS} --project-directory "${INSTALL_DIR}" "$@"
}

wait_for_postgres() {
  info "Ожидание запуска PostgreSQL..."
  local retries=30
  until dc exec -T postgres pg_isready -U hunger -q 2>/dev/null; do
    retries=$((retries - 1))
    [[ $retries -le 0 ]] && die "PostgreSQL не запустился за 60 секунд"
    sleep 2
  done
  log "PostgreSQL готов"
}

# ── Pull images ────────────────────────────────────────────────────────────────
pull_images() {
  step "Загрузка Docker образов"
  info "Загружаю образы из GHCR (это может занять несколько минут)..."
  dc pull --quiet 2>>"${LOG_FILE}" || {
    warn "Не удалось загрузить pre-built образы — собираю из исходников..."
    info "Это займёт 5–10 минут..."
    dc build --quiet 2>>"${LOG_FILE}"
  }
  log "Образы готовы"
}

# ── Start services ─────────────────────────────────────────────────────────────
start_services() {
  step "Запуск сервисов"
  dc up -d --remove-orphans 2>>"${LOG_FILE}"
  log "Все сервисы запущены"
  wait_for_postgres
}

# ── Migrations ─────────────────────────────────────────────────────────────────
run_migrations() {
  step "Применение миграций базы данных"
  dc exec -T api alembic upgrade head 2>>"${LOG_FILE}"
  log "Миграции применены"
}

# ── Seed ──────────────────────────────────────────────────────────────────────
run_seed() {
  step "Инициализация данных"
  dc exec -T api python -m scripts.seed_init 2>>"${LOG_FILE}" \
    && log "Данные инициализированы" \
    || warn "Seed пропущен (возможно, база уже инициализирована)"
}

# ── Telegram webhook ───────────────────────────────────────────────────────────
setup_webhook() {
  step "Настройка Telegram webhook"
  local webhook_url="https://${DOMAIN}/api/v1/tg/webhook/${TG_WEBHOOK_SECRET}"
  info "URL вебхука: ${webhook_url}"

  local response
  response=$(curl -s -X POST \
    "https://api.telegram.org/bot${TG_TOKEN}/setWebhook" \
    -d "url=${webhook_url}" \
    -d "allowed_updates=[\"message\",\"callback_query\",\"pre_checkout_query\",\"shipping_query\"]" \
    -d "drop_pending_updates=true" 2>/dev/null)

  if echo "${response}" | grep -q '"ok":true'; then
    log "Telegram webhook установлен"
  else
    warn "Telegram webhook: ${response}"
    warn "Настройте вручную после получения SSL-сертификата"
    warn "  POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=${webhook_url}"
  fi
}

# ── Cron for backups ───────────────────────────────────────────────────────────
setup_cron() {
  step "Настройка автоматических бэкапов (cron)"
  local cron_line="0 3 * * * /bin/bash ${INSTALL_DIR}/deploy/scripts/backup.sh >> /var/log/hunger-backup.log 2>&1"
  # Добавляем только если ещё нет
  if ! crontab -l 2>/dev/null | grep -q "hunger.*backup"; then
    (crontab -l 2>/dev/null; echo "${cron_line}") | crontab -
    log "Cron настроен: ежедневный бэкап в 03:00"
  else
    log "Cron для бэкапов уже настроен"
  fi
}

# ── Health check ───────────────────────────────────────────────────────────────
health_check() {
  step "Проверка работоспособности"
  local retries=12
  info "Ожидаю запуска API..."
  until curl -sf "http://localhost:8000/healthz" &>/dev/null; do
    retries=$((retries - 1))
    [[ $retries -le 0 ]] && { warn "Healthcheck не прошёл — проверьте: dc logs api"; break; }
    sleep 5
  done
  [[ $retries -gt 0 ]] && log "API отвечает"

  info "Ожидаю получения TLS-сертификата (Let's Encrypt)..."
  local tls_retries=18
  until curl -sf "https://${DOMAIN}/healthz" &>/dev/null; do
    tls_retries=$((tls_retries - 1))
    [[ $tls_retries -le 0 ]] && {
      warn "HTTPS ещё не готов. Это нормально если DNS недавно обновлён."
      warn "Проверьте позже: curl -I https://${DOMAIN}"
      break
    }
    sleep 10
  done
  [[ $tls_retries -gt 0 ]] && log "HTTPS работает"
}

# ── Print results ──────────────────────────────────────────────────────────────
print_result() {
  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║                ✅  УСТАНОВКА ЗАВЕРШЕНА!                   ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  printf "║  %-56s  ║\n" ""
  printf "║  %-56s  ║\n" "  Панель управления:"
  printf "║  %-56s  ║\n" "  → https://${DOMAIN}/login"
  printf "║  %-56s  ║\n" ""
  printf "║  %-56s  ║\n" "  Логин:   owner@adm-test.tech"
  printf "║  %-56s  ║\n" "  Пароль:  ${OWNER_PASSWORD}"
  printf "║  %-56s  ║\n" ""
  printf "║  %-56s  ║\n" "  Также созданы аккаунты:"
  printf "║  %-56s  ║\n" "  admin@adm-test.tech  / master@adm-test.tech"
  printf "║  %-56s  ║\n" "  reception@adm-test.tech"
  printf "║  %-56s  ║\n" "  (тот же пароль)"
  printf "║  %-56s  ║\n" ""
  echo "╠══════════════════════════════════════════════════════════╣"
  printf "║  %-56s  ║\n" ""
  printf "║  %-56s  ║\n" "  ⚠️  ВАЖНО: После первого входа:"
  printf "║  %-56s  ║\n" "  1. Смените email и пароль owner-аккаунта"
  printf "║  %-56s  ║\n" "  2. Настройте название и данные салона"
  printf "║  %-56s  ║\n" "  3. Добавьте мастеров и услуги"
  printf "║  %-56s  ║\n" ""
  echo "╠══════════════════════════════════════════════════════════╣"
  printf "║  %-56s  ║\n" ""
  printf "║  %-56s  ║\n" "  Управление:"
  printf "║  %-56s  ║\n" "  Статус:   cd ${INSTALL_DIR} && dc ps"
  printf "║  %-56s  ║\n" "  Логи:     dc logs -f api"
  printf "║  %-56s  ║\n" "  Бэкап:    bash deploy/scripts/backup.sh"
  printf "║  %-56s  ║\n" "  Обновление: bash deploy/scripts/update.sh"
  printf "║  %-56s  ║\n" ""
  printf "║  %-56s  ║\n" "  Документация: ${INSTALL_DIR}/docs/INSTALL.md"
  printf "║  %-56s  ║\n" ""
  echo "╚══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  # Сохранить credentials
  cat > "${INSTALL_DIR}/.credentials" << CREDS
# Hunger Beauty Platform — созданные учётные данные
# Сохраните в надёжном месте!
# Дата установки: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

URL:           https://${DOMAIN}
Owner email:   owner@adm-test.tech
Owner password: ${OWNER_PASSWORD}

Все аккаунты используют один пароль (до его смены):
  admin@adm-test.tech
  master@adm-test.tech
  reception@adm-test.tech
CREDS
  chmod 600 "${INSTALL_DIR}/.credentials"
  info "Credentials сохранены: ${INSTALL_DIR}/.credentials"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  banner

  # Redirect all stdout+stderr to log while keeping terminal output
  exec > >(tee -a "${LOG_FILE}") 2>&1

  check_root
  check_os
  check_ports
  install_docker
  clone_repo
  prompt_config
  generate_env
  pull_images
  start_services
  run_migrations
  run_seed
  setup_webhook
  setup_cron
  health_check
  print_result
}

main "$@"
