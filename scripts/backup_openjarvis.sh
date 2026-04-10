#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_DIR="$BACKUP_ROOT/$STAMP"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$TARGET_DIR"

copy_if_exists() {
  local src="$1"
  local name="$2"
  if [ -e "$src" ]; then
    cp -R "$src" "$TARGET_DIR/$name"
  fi
}

copy_if_exists "$HOME/.openjarvis" "openjarvis-data"
copy_if_exists "$ROOT_DIR/deploy/env/openjarvis.production.env" "openjarvis.production.env"

if command -v docker >/dev/null 2>&1; then
  if docker volume inspect openjarvis_openjarvis-data >/dev/null 2>&1; then
    docker run --rm \
      -v openjarvis_openjarvis-data:/source:ro \
      -v "$TARGET_DIR":/backup \
      alpine sh -c "cd /source && tar -czf /backup/openjarvis-volume.tgz ."
  fi
  if docker volume inspect openjarvis_ollama-models >/dev/null 2>&1; then
    docker run --rm \
      -v openjarvis_ollama-models:/source:ro \
      -v "$TARGET_DIR":/backup \
      alpine sh -c "cd /source && tar -czf /backup/ollama-models.tgz ."
  fi
fi

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

echo "Backup complete: $TARGET_DIR"
