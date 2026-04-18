#!/usr/bin/env bash
# tag_version.sh — автоматически создаёт git-тег формата "ver1.0 — описание"
# Запускается GitHub Actions при каждом push в main.
set -euo pipefail

# Получить последний тег формата ver*
LAST_TAG=$(git tag --list 'ver*' --sort=-version:refname | head -n1)

if [[ -z "$LAST_TAG" ]]; then
  MAJOR=1
  MINOR=0
else
  VERSION_PART=$(echo "$LAST_TAG" | grep -oP 'ver\K[\d.]+')
  MAJOR=$(echo "$VERSION_PART" | cut -d. -f1)
  MINOR=$(echo "$VERSION_PART" | cut -d. -f2)
  MINOR=$((MINOR + 1))
fi

# Описание из темы последнего коммита
COMMIT_MSG=$(git log -1 --format="%s")
SAFE_DESC=$(echo "$COMMIT_MSG" | head -c 80)

NEW_TAG="ver${MAJOR}.${MINOR} — ${SAFE_DESC}"

echo "Creating tag: $NEW_TAG"
git tag "$NEW_TAG"
git push origin "$NEW_TAG"
