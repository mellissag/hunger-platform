#!/usr/bin/env bash
# Запуск на VPS (из каталога репозитория или с INSTALL_DIR):
#   INSTALL_DIR=/opt/hunger-platform bash deploy/scripts/server-update.sh
#
# Или одной строкой по SSH:
#   ssh deploy@ВАШ_IP 'INSTALL_DIR=/opt/hunger-platform bash -s' < deploy/scripts/server-update.sh
#
set -euo pipefail

: "${INSTALL_DIR:=/opt/hunger-platform}"
cd "${INSTALL_DIR}"

[[ -f .env ]] || { echo "Нет ${INSTALL_DIR}/.env"; exit 1; }

COMPOSE_BASE=(docker compose
  -f "${INSTALL_DIR}/deploy/docker-compose.yml"
  -f "${INSTALL_DIR}/deploy/docker-compose.prod.yml"
  --env-file "${INSTALL_DIR}/.env"
  --project-directory "${INSTALL_DIR}"
)

echo "==> git: main @ ${INSTALL_DIR}"
git fetch --all --tags
git checkout main
git pull --ff-only origin main

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  echo "==> docker login ghcr.io"
  : "${GHCR_USERNAME:=$(grep -E '^GITHUB_REPOSITORY=' .env | head -1 | cut -d= -f2 | cut -d/ -f1)}"
  [[ -n "${GHCR_USERNAME}" ]] || GHCR_USERNAME="mellissag"
  echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
fi

echo "==> docker compose pull"
"${COMPOSE_BASE[@]}" pull

echo "==> docker compose up"
"${COMPOSE_BASE[@]}" up -d --remove-orphans

echo "==> alembic upgrade"
"${COMPOSE_BASE[@]}" exec -T api alembic upgrade head

echo "==> healthz"
sleep 3
curl -sf "http://127.0.0.1:8000/healthz" && echo " OK" || {
  echo "Health check failed — см. логи:"
  "${COMPOSE_BASE[@]}" logs api --tail=40
  exit 1
}

echo "==> готово"
"${COMPOSE_BASE[@]}" ps
