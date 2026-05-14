#!/usr/bin/env bash
# Скопировать локальный .env на VPS и пересоздать контейнеры (подхватить новые переменные).
# Запуск с машины, где есть SSH-доступ к серверу и актуальный файл .env в корне репозитория.
#
# Обязательно:
#   export VPS_HOST=example.com        # или IP
#   export VPS_USER=deploy              # пользователь SSH
#
# Опционально:
#   export VPS_PORT=22
#   export VPS_SSH_KEY=$HOME/.ssh/id_ed25519
#   export VPS_APP_DIR=/opt/hunger-platform
#   export VPS_USE_PROD_OVERLAY=1       # 1 = как в GitHub Actions (docker-compose.prod.yml), 0 = только base compose
#   export ENV_FILE=/path/to/.env       # по умолчанию: корень репозитория (родитель deploy/)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"
APP_DIR="${VPS_APP_DIR:-/opt/hunger-platform}"

: "${VPS_HOST:?Укажите VPS_HOST (домен или IP)}"
: "${VPS_USER:?Укажите VPS_USER}"
SSH_KEY="${VPS_SSH_KEY:-${HOME}/.ssh/id_ed25519}"
PORT="${VPS_PORT:-22}"
USE_PROD="${VPS_USE_PROD_OVERLAY:-1}"

[[ -f "${ENV_FILE}" ]] || { echo "Нет файла: ${ENV_FILE}"; exit 1; }
[[ -f "${SSH_KEY}" ]] || { echo "Нет ключа SSH: ${SSH_KEY}"; exit 1; }

SSH_BASE=(ssh -i "${SSH_KEY}" -p "${PORT}" -o StrictHostKeyChecking=accept-new "${VPS_USER}@${VPS_HOST}")
SCP_BASE=(scp -i "${SSH_KEY}" -P "${PORT}" -o StrictHostKeyChecking=accept-new)

echo "==> Копирую ${ENV_FILE} → ${VPS_USER}@${VPS_HOST}:${APP_DIR}/.env"
"${SCP_BASE[@]}" "${ENV_FILE}" "${VPS_USER}@${VPS_HOST}:${APP_DIR}/.env"

echo "==> Перезапуск Docker Compose (подхват ../.env)…"
if [[ "${USE_PROD}" == "1" ]]; then
  COMPOSE_CMD="cd ${APP_DIR}/deploy && docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file ../.env up -d --remove-orphans"
else
  COMPOSE_CMD="cd ${APP_DIR}/deploy && docker compose -f docker-compose.yml --env-file ../.env up -d --remove-orphans"
fi

"${SSH_BASE[@]}" "set -e; ${COMPOSE_CMD}"
echo "==> Готово. Проверьте вебхук Meta: curl с hub.mode=subscribe и hub.verify_token."
