#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-directory>"
  exit 1
fi

SOURCE_DIR="$1"
HOME_DATA="${HOME}/.openjarvis"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Backup directory not found: $SOURCE_DIR"
  exit 1
fi

mkdir -p "$HOME_DATA"

if [ -d "$SOURCE_DIR/openjarvis-data" ]; then
  rsync -a "$SOURCE_DIR/openjarvis-data"/ "$HOME_DATA"/
fi

if [ -f "$SOURCE_DIR/openjarvis.production.env" ]; then
  mkdir -p "$(dirname "$PWD/deploy/env/openjarvis.production.env")"
  cp "$SOURCE_DIR/openjarvis.production.env" "$PWD/deploy/env/openjarvis.production.env"
fi

if command -v docker >/dev/null 2>&1; then
  if [ -f "$SOURCE_DIR/openjarvis-volume.tgz" ] && docker volume inspect openjarvis_openjarvis-data >/dev/null 2>&1; then
    docker run --rm \
      -v openjarvis_openjarvis-data:/target \
      -v "$SOURCE_DIR":/backup:ro \
      alpine sh -c "cd /target && tar -xzf /backup/openjarvis-volume.tgz"
  fi
  if [ -f "$SOURCE_DIR/ollama-models.tgz" ] && docker volume inspect openjarvis_ollama-models >/dev/null 2>&1; then
    docker run --rm \
      -v openjarvis_ollama-models:/target \
      -v "$SOURCE_DIR":/backup:ro \
      alpine sh -c "cd /target && tar -xzf /backup/ollama-models.tgz"
  fi
fi

echo "Restore complete from: $SOURCE_DIR"
