#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
cd "$ROOT_DIR"

detect_python_minor() {
  local candidate
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      "$candidate" - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
      return 0
    fi
  done
  echo "unknown"
}

PYTHON_MINOR="$(detect_python_minor)"
COMMON_EXTRAS=(--extra server --extra speech --extra speech-live --extra speech-tts-local)
WAKE_EXTRAS=(--extra speech-wake)

if [[ "$PYTHON_MINOR" == "3.12" ]]; then
  echo "speech-wake skipped on Python 3.12 because openwakeword currently pulls an unsupported tflite-runtime wheel."
  uv sync "${COMMON_EXTRAS[@]}"
else
  if ! uv sync "${COMMON_EXTRAS[@]}" "${WAKE_EXTRAS[@]}"; then
    echo "speech-wake unavailable on this Python build, retrying without it..."
    uv sync "${COMMON_EXTRAS[@]}"
  fi
fi

exec uv run jarvis serve --port 8000
