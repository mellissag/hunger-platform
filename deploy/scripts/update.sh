#!/usr/bin/env bash
# =============================================================================
# Hunger Beauty Platform — Update Script
# =============================================================================
# Обновление до последней версии:
#   1. git fetch + checkout latest vX.Y.Z tag
#   2. Pre-update backup
#   3. docker compose pull новых образов
#   4. docker compose up -d
#   5. alembic upgrade head
#   6. Health check
#
# Использование:
#   bash /opt/hunger-platform/deploy/scripts/update.sh
#   bash /opt/hunger-platform/deploy/scripts/update.sh v1.2.0  # конкретная версия
# =============================================================================
set -euo pipefail

# ── Настройки ─────────────────────────────────────────────────────────────────
: "${INSTALL_DIR:=/opt/hunger-platform}"

TARGET_TAG="${1:-}"   # Если не указан — берём последний

COMPOSE_FILES="-f ${INSTALL_DIR}/deploy/docker-compose.yml -f ${INSTALL_DIR}/deploy/docker-compose.prod.yml"
COMPOSE_OPTS="--env-file ${INSTALL_DIR}/.env --project-directory ${INSTALL_DIR}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "\033[32m[✓]\033[0m $*"; }
info() { echo -e "\033[34m[i]\033[0m $*"; }
warn() { echo -e "\033[33m[!]\033[0m $*"; }
err()  { echo -e "\033[31m[✗]\033[0m $*" >&2; }
die()  { err "$*"; exit 1; }

step() {
  echo ""
  echo -e "\033[1m\033[36m══ $* \033[0m"
}

# shellcheck disable=SC2086
dc() { docker compose ${COMPOSE_FILES} ${COMPOSE_OPTS} "$@"; }

# ── Preflight ─────────────────────────────────────────────────────────────────
[[ -d "${INSTALL_DIR}/.git" ]] || die "${INSTALL_DIR} не является git-репозиторием"
[[ -f "${INSTALL_DIR}/.env" ]] || die ".env не найден в ${INSTALL_DIR}"

cd "${INSTALL_DIR}"

# ── Step 1: Fetch tags ────────────────────────────────────────────────────────
step "1/6  Получение новых версий"
git fetch --all --tags --quiet

CURRENT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "unknown")
info "Текущая версия: ${CURRENT_TAG}"

if [[ -n "${TARGET_TAG}" ]]; then
  NEW_TAG="${TARGET_TAG}"
else
  NEW_TAG=$(git tag --list 'v*' --sort=-version:refname | head -n1 || true)
fi

if [[ -z "${NEW_TAG}" ]]; then
  warn "Теги vX.Y.Z не найдены. Обновляю HEAD main..."
  git checkout main --quiet
  git pull origin main --quiet
  NEW_TAG="main (HEAD)"
elif [[ "${CURRENT_TAG}" == "${NEW_TAG}" ]]; then
  log "Уже установлена последняя версия: ${NEW_TAG}"
  info "Для принудительного обновления образов используйте флаг --force:"
  info "  bash update.sh ${NEW_TAG} --force"
  if [[ "${2:-}" != "--force" ]]; then
    exit 0
  fi
  warn "Принудительное обновление образов..."
else
  info "Обновляю: ${CURRENT_TAG} → ${NEW_TAG}"
  git checkout --quiet "${NEW_TAG}"
  log "Переключился на ${NEW_TAG}"
fi

# ── Step 2: Pre-update backup ─────────────────────────────────────────────────
step "2/6  Создание бэкапа перед обновлением"
if bash "${INSTALL_DIR}/deploy/scripts/backup.sh"; then
  log "Бэкап создан"
else
  warn "Бэкап не удался — продолжаю обновление"
  warn "Рекомендуется создать бэкап вручную перед продолжением"
  sleep 3
fi

# ── Step 3: Pull new images ───────────────────────────────────────────────────
step "3/6  Загрузка новых Docker образов"
info "Загружаю образы..."
if dc pull --quiet 2>/dev/null; then
  log "Образы обновлены"
else
  warn "Не удалось загрузить образы — пересборка из исходников..."
  dc build --quiet
  log "Образы пересобраны"
fi

# ── Step 4: Restart services ──────────────────────────────────────────────────
step "4/6  Перезапуск сервисов"
dc up -d --remove-orphans
log "Сервисы перезапущены"

# Ждём готовности postgres
info "Ожидание PostgreSQL..."
retries=20
until dc exec -T postgres pg_isready -U hunger -q 2>/dev/null; do
  retries=$((retries - 1))
  [[ $retries -le 0 ]] && die "PostgreSQL не запустился"
  sleep 3
done
log "PostgreSQL готов"

# ── Step 5: Migrations ────────────────────────────────────────────────────────
step "5/6  Применение миграций БД"
dc exec -T api alembic upgrade head
log "Миграции применены"

# ── Step 6: Health check ──────────────────────────────────────────────────────
step "6/6  Проверка работоспособности"
sleep 5
if dc exec -T api curl -sf http://localhost:8000/healthz > /dev/null 2>&1; then
  log "API healthcheck: OK"
else
  warn "Healthcheck не прошёл"
  info "Проверьте логи: cd ${INSTALL_DIR} && docker compose logs api --tail=50"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "\033[1m\033[32m════════════════════════════════════════\033[0m"
echo -e "\033[1m\033[32m  ✅  Обновление завершено!\033[0m"
echo -e "\033[32m  Версия: ${NEW_TAG}\033[0m"
echo -e "\033[1m\033[32m════════════════════════════════════════\033[0m"
echo ""
dc ps
