#!/usr/bin/env bash
# Запуск на VPS из корня репозитория (после up): проверяет, что Caddy и API отвечают.
#   bash deploy/scripts/verify-stack.sh
set -euo pipefail
: "${INSTALL_DIR:=$(cd "$(dirname "$0")/../.." && pwd)}"
cd "${INSTALL_DIR}"
_get() { [[ -f .env ]] && sed -n "s/^$1=//p" .env | head -1; }
HTTP_PORT="${CADDY_HTTP_PORT:-$(_get CADDY_HTTP_PORT)}"
HTTP_PORT="${HTTP_PORT:-8080}"
DOMAIN="${APP_DOMAIN:-$(_get APP_DOMAIN)}"
DOMAIN="${DOMAIN:-localhost}"

echo "==> Caddy (host :${HTTP_PORT}) /healthz"
if curl -sfS -m 5 -H "Host: ${DOMAIN}" "http://127.0.0.1:${HTTP_PORT}/healthz" >/dev/null; then
  echo "    OK (Host: ${DOMAIN})"
else
  echo "    FAIL — контейнер caddy не отвечает. Проверьте: docker compose ps, docker compose logs caddy"
  exit 1
fi

if command -v docker >/dev/null; then
  echo "==> docker compose (кратко)"
  docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml \
    --env-file .env --project-directory deploy ps 2>/dev/null || true
fi
echo "==> готово"
