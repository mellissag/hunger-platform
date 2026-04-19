#!/usr/bin/env bash
# =============================================================================
# Hunger Beauty Platform — Backup Script
# =============================================================================
# pg_dump с ротацией: 7 ежедневных / 4 еженедельных / 3 ежемесячных
#
# Использование:
#   bash /opt/hunger-platform/deploy/scripts/backup.sh
#
# Cron (автоматически настраивается install.sh):
#   0 3 * * * /bin/bash /opt/hunger-platform/deploy/scripts/backup.sh >> /var/log/hunger-backup.log 2>&1
# =============================================================================
set -euo pipefail

# ── Настройки ─────────────────────────────────────────────────────────────────
: "${INSTALL_DIR:=/opt/hunger-platform}"
: "${BACKUP_BASE:=${INSTALL_DIR}/backups}"
: "${KEEP_DAILY:=7}"
: "${KEEP_WEEKLY:=4}"
: "${KEEP_MONTHLY:=3}"

DATE=$(date +%Y%m%d_%H%M%S)
YEAR_MONTH=$(date +%Y%m)
DAY_OF_WEEK=$(date +%u)   # 1=Пн … 7=Вс
DAY_OF_MONTH=$(date +%d)

DAILY_DIR="${BACKUP_BASE}/daily"
WEEKLY_DIR="${BACKUP_BASE}/weekly"
MONTHLY_DIR="${BACKUP_BASE}/monthly"

COMPOSE_FILES="-f ${INSTALL_DIR}/deploy/docker-compose.yml -f ${INSTALL_DIR}/deploy/docker-compose.prod.yml"
COMPOSE_OPTS="--env-file ${INSTALL_DIR}/.env --project-directory ${INSTALL_DIR}"

# shellcheck disable=SC2086
dc() { docker compose ${COMPOSE_FILES} ${COMPOSE_OPTS} "$@"; }

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]  $*"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN]  $*"; }
err()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" >&2; }
die()  { err "$*"; exit 1; }

# ── Create directories ────────────────────────────────────────────────────────
mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}" "${MONTHLY_DIR}"

# ── Load env ──────────────────────────────────────────────────────────────────
ENV_FILE="${INSTALL_DIR}/.env"
[[ -f "${ENV_FILE}" ]] || die ".env не найден: ${ENV_FILE}"

# shellcheck source=/dev/null
source "${ENV_FILE}"
PG_USER="${POSTGRES_USER:-hunger}"
PG_DB="${POSTGRES_DB:-hunger}"

# ── Check postgres is running ─────────────────────────────────────────────────
if ! dc exec -T postgres pg_isready -U "${PG_USER}" -q 2>/dev/null; then
  die "PostgreSQL недоступен. Убедитесь, что контейнер запущен."
fi

# ── Daily backup ──────────────────────────────────────────────────────────────
DAILY_FILE="${DAILY_DIR}/hunger_${DATE}.sql.gz"
log "Создаю ежедневный бэкап → ${DAILY_FILE}"

dc exec -T postgres \
  pg_dump -U "${PG_USER}" -d "${PG_DB}" \
  --no-owner --no-privileges \
  --format=custom \
  | gzip -9 > "${DAILY_FILE}"

BACKUP_SIZE=$(du -sh "${DAILY_FILE}" | cut -f1)
log "Бэкап создан: ${DAILY_FILE} (${BACKUP_SIZE})"

# ── Weekly backup (каждое воскресенье) ────────────────────────────────────────
if [[ "${DAY_OF_WEEK}" == "7" ]]; then
  WEEKLY_FILE="${WEEKLY_DIR}/hunger_weekly_${DATE}.sql.gz"
  cp "${DAILY_FILE}" "${WEEKLY_FILE}"
  log "Еженедельный бэкап → ${WEEKLY_FILE}"
fi

# ── Monthly backup (1-го числа каждого месяца) ────────────────────────────────
if [[ "${DAY_OF_MONTH}" == "01" ]]; then
  MONTHLY_FILE="${MONTHLY_DIR}/hunger_monthly_${YEAR_MONTH}.sql.gz"
  cp "${DAILY_FILE}" "${MONTHLY_FILE}"
  log "Ежемесячный бэкап → ${MONTHLY_FILE}"
fi

# ── Rotation ──────────────────────────────────────────────────────────────────
rotate() {
  local dir="$1" keep="$2" label="$3"
  local count
  count=$(find "${dir}" -name "*.sql.gz" -type f | wc -l)
  if [[ ${count} -gt ${keep} ]]; then
    local to_delete=$(( count - keep ))
    log "Ротация ${label}: удаляю ${to_delete} старых (оставляю ${keep})"
    # Сортировка по имени (имя содержит дату), удаляем самые старые
    # shellcheck disable=SC2012
    ls -t "${dir}"/*.sql.gz 2>/dev/null | tail -n "${to_delete}" | xargs -r rm -f
  fi
}

rotate "${DAILY_DIR}"   "${KEEP_DAILY}"   "ежедневных"
rotate "${WEEKLY_DIR}"  "${KEEP_WEEKLY}"  "еженедельных"
rotate "${MONTHLY_DIR}" "${KEEP_MONTHLY}" "ежемесячных"

# ── Summary ───────────────────────────────────────────────────────────────────
DAILY_COUNT=$(find "${DAILY_DIR}"   -name "*.sql.gz" -type f | wc -l)
WEEKLY_COUNT=$(find "${WEEKLY_DIR}" -name "*.sql.gz" -type f | wc -l)
MONTHLY_COUNT=$(find "${MONTHLY_DIR}" -name "*.sql.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_BASE}" | cut -f1)

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Бэкапы: ежедневных=${DAILY_COUNT}/${KEEP_DAILY}  еженедельных=${WEEKLY_COUNT}/${KEEP_WEEKLY}  ежемесячных=${MONTHLY_COUNT}/${KEEP_MONTHLY}"
log "Общий размер: ${TOTAL_SIZE}"
log "Бэкап завершён успешно ✓"

# ── Restore hint ──────────────────────────────────────────────────────────────
# Для восстановления из бэкапа:
#   docker compose exec -T postgres \
#     pg_restore -U hunger -d hunger --clean --if-exists \
#     < backup_file.sql.gz | gunzip
