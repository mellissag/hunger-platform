#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# disk-cleanup.sh — автоматическая очистка диска
#
# Запускается cron'ом каждый день в 03:00.
# Если диск заполнен > THRESHOLD % — чистит Docker-кэш,
# старые образы, /tmp и старые логи.
# Логирует каждый запуск в /var/log/disk-cleanup.log
# ─────────────────────────────────────────────────────────────

set -euo pipefail

LOG="/var/log/disk-cleanup.log"
THRESHOLD=80   # начинать чистить при заполнении > 80 %
CRITICAL=90    # критический порог — чистить aggressively

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# ── Текущее заполнение диска ────────────────────────────────
USED=$(df / --output=pcent | tail -1 | tr -d ' %')
log "Disk usage: ${USED}% (threshold: ${THRESHOLD}%)"

if [[ "$USED" -lt "$THRESHOLD" ]]; then
  log "OK — no cleanup needed."
  exit 0
fi

log "WARNING: disk at ${USED}% — starting cleanup..."
FREE_BEFORE=$(df / --output=avail -h | tail -1 | tr -d ' ')

# ── 1. Удалить временные файлы старше 2 ч ──────────────────
log "Cleaning /tmp (files older than 2h)..."
find /tmp -type f -mmin +120 -delete 2>/dev/null || true

# ── 2. Docker: dangling images, stopped containers ─────────
log "Pruning Docker build cache and dangling images..."
docker system prune -f >> "$LOG" 2>&1 || true

# ── 3. Агрессивная чистка при критическом заполнении ───────
if [[ "$USED" -ge "$CRITICAL" ]]; then
  log "CRITICAL: disk at ${USED}% — removing unused Docker images..."
  docker image prune -a -f >> "$LOG" 2>&1 || true

  log "Cleaning Docker build cache completely..."
  docker builder prune -a -f >> "$LOG" 2>&1 || true

  # Truncate large log files (keep last 50k lines each)
  log "Truncating large system logs..."
  for f in /var/log/syslog /var/log/kern.log /var/log/auth.log; do
    if [[ -f "$f" && $(wc -l < "$f") -gt 50000 ]]; then
      tail -50000 "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
      log "  Truncated $f"
    fi
  done
fi

FREE_AFTER=$(df / --output=avail -h | tail -1 | tr -d ' ')
USED_AFTER=$(df / --output=pcent | tail -1 | tr -d ' %')

log "Cleanup done: ${FREE_BEFORE} → ${FREE_AFTER} free, disk now at ${USED_AFTER}%"

# ── 4. Предупреждение, если всё ещё критично ───────────────
if [[ "$USED_AFTER" -ge "$CRITICAL" ]]; then
  log "ALERT: disk is still at ${USED_AFTER}% after cleanup — manual intervention needed!"
fi
