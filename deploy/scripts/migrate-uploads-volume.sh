#!/usr/bin/env bash
# =============================================================================
# Hunger Beauty Platform — Migrate uploads from old named volume → bind-mount
# =============================================================================
# Контекст:
#   До коммита d840945 загруженные медиа жили в Docker named volume
#   `hunger-beauty_uploads_data`. Затем мы перешли на bind-mount
#   ${INSTALL_DIR}/data/uploads. Если деплой произошёл без переноса данных —
#   контейнер api маунтит пустую папку и /media/* отдаёт 404 для всех файлов.
#
# Этот скрипт идемпотентно копирует содержимое старого named volume в
# актуальный bind-mount, если в нём отсутствуют файлы. После успешного
# переноса старый volume можно удалить вручную:
#   docker volume rm hunger-beauty_uploads_data
#
# Безопасно вызывать многократно — существующие файлы не перезаписываются.
#
# Использование:
#   bash /opt/hunger-platform/deploy/scripts/migrate-uploads-volume.sh
# =============================================================================
set -euo pipefail

: "${INSTALL_DIR:=/opt/hunger-platform}"
: "${LEGACY_VOLUME:=hunger-beauty_uploads_data}"

DEST="${INSTALL_DIR}/data/uploads"

log()  { echo -e "\033[32m[✓]\033[0m $*"; }
info() { echo -e "\033[34m[i]\033[0m $*"; }
warn() { echo -e "\033[33m[!]\033[0m $*"; }

if ! command -v docker >/dev/null 2>&1; then
  warn "docker не установлен — пропускаю миграцию uploads"
  exit 0
fi

if ! docker volume inspect "${LEGACY_VOLUME}" >/dev/null 2>&1; then
  info "Старый volume ${LEGACY_VOLUME} не найден — миграция не требуется"
  exit 0
fi

mkdir -p "${DEST}"

# Подсчёт файлов в назначении (исключая .gitkeep) — если уже всё на месте, выходим
existing=$(find "${DEST}" -type f ! -name '.gitkeep' 2>/dev/null | wc -l | tr -d ' ')
legacy=$(docker run --rm -v "${LEGACY_VOLUME}":/src alpine sh -c 'find /src -type f 2>/dev/null | wc -l' | tr -d ' ')

info "Файлов в bind-mount ${DEST}: ${existing}"
info "Файлов в старом volume ${LEGACY_VOLUME}: ${legacy}"

if [[ "${legacy}" -eq 0 ]]; then
  info "Старый volume пуст — нечего переносить"
  exit 0
fi

if [[ "${existing}" -ge "${legacy}" ]]; then
  log "Bind-mount уже содержит не меньше файлов, чем legacy volume — пропускаю копирование"
  info "Когда убедитесь, что всё работает, можно удалить старый volume:"
  info "  docker volume rm ${LEGACY_VOLUME}"
  exit 0
fi

info "Переношу uploads из ${LEGACY_VOLUME} → ${DEST}…"

# cp -an: не перезаписывать существующие файлы (идемпотентно), сохранять
# атрибуты. -R обходит подпапки. -v подробный лог.
docker run --rm \
  -v "${LEGACY_VOLUME}":/src:ro \
  -v "${DEST}":/dst \
  alpine sh -c 'set -e; for d in services salons masters broadcasts chat color_formulas misc; do
    if [ -d "/src/$d" ]; then cp -aRnv "/src/$d" /dst/ 2>&1 | tail -n 30; fi
  done; echo "done"'

final=$(find "${DEST}" -type f ! -name '.gitkeep' 2>/dev/null | wc -l | tr -d ' ')
log "Готово. Файлов в bind-mount теперь: ${final}"
info "Старый volume оставлен на месте. Когда убедитесь, что всё ок:"
info "  docker volume rm ${LEGACY_VOLUME}"
