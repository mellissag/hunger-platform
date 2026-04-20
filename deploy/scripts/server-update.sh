#!/usr/bin/env bash
# Запуск на VPS:
#   INSTALL_DIR=/opt/hunger-platform bash deploy/scripts/server-update.sh
#
# Режимы:
#   • Если в .env есть GITHUB_REPOSITORY — тянем образы из GHCR (docker-compose.prod.yml).
#   • Иначе — локальная сборка из git (как типичный VPS без GHCR): build web api worker + up.
#
set -euo pipefail

: "${INSTALL_DIR:=/opt/hunger-platform}"
cd "${INSTALL_DIR}"

[[ -f .env ]] || { echo "Нет ${INSTALL_DIR}/.env"; exit 1; }

echo "==> git: ${INSTALL_DIR}"
git fetch --all --tags
git checkout main
git pull --ff-only origin main

uses_ghcr=false
if grep -qE '^GITHUB_REPOSITORY=' .env 2>/dev/null; then
  uses_ghcr=true
fi

if [[ "${uses_ghcr}" == true ]]; then
  echo "==> режим GHCR (prod overlay)"
  DC=(docker compose
    -f deploy/docker-compose.yml
    -f deploy/docker-compose.prod.yml
    --env-file .env
  )
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    echo "==> docker login ghcr.io"
    : "${GHCR_USERNAME:=$(grep -E '^GITHUB_REPOSITORY=' .env | head -1 | cut -d= -f2 | cut -d/ -f1)}"
    [[ -n "${GHCR_USERNAME}" ]] || GHCR_USERNAME="mellissag"
    echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
  fi
  "${DC[@]}" pull
  "${DC[@]}" up -d --remove-orphans
else
  echo "==> режим локальной сборки (без GITHUB_REPOSITORY в .env)"
  DC=(docker compose -f deploy/docker-compose.yml --env-file .env)
  "${DC[@]}" build web api worker
  "${DC[@]}" up -d --remove-orphans
fi

echo "==> alembic upgrade"
"${DC[@]}" exec -T api alembic upgrade head

echo "==> healthz (внутри контейнера api)"
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec hunger-beauty-api-1 python -c \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz').read()" \
    2>/dev/null; then
    ok=1
    break
  fi
  sleep 2
done
if [[ "${ok}" -eq 1 ]]; then
  echo " OK"
else
  echo "Health check failed — см. логи:"
  "${DC[@]}" logs api --tail=40
  exit 1
fi

echo "==> готово"
"${DC[@]}" ps
