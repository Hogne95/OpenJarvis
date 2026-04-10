#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${OPENJARVIS_BASE_URL:-http://127.0.0.1:8000}"

check() {
  local path="$1"
  local label="$2"
  if curl -fsS "$BASE_URL$path" >/dev/null; then
    echo "[ok] $label"
  else
    echo "[fail] $label"
    return 1
  fi
}

check "/health" "API health"
check "/v1/readiness" "API readiness"
check "/v1/speech/health" "speech health"
check "/v1/voice-loop/status" "voice loop status"
