"""Helpers for resolving deployment secrets from env vars or mounted files."""

from __future__ import annotations

import os
from pathlib import Path


def resolve_secret(name: str, default: str = "") -> str:
    """Return a secret from ``NAME`` or ``NAME_FILE``.

    ``NAME`` wins if both are present. ``NAME_FILE`` is useful for Docker
    secrets or other mounted secret files in broader-user deployments.
    """

    direct = (os.environ.get(name, "") or "").strip()
    if direct:
        return direct

    file_path = (os.environ.get(f"{name}_FILE", "") or "").strip()
    if not file_path:
        return default

    try:
        return Path(file_path).read_text(encoding="utf-8").strip()
    except OSError:
        return default


def apply_secret_file_overrides(names: list[str]) -> None:
    """Populate env vars from ``*_FILE`` variants when needed."""

    for name in names:
        value = resolve_secret(name, default="")
        if value and not (os.environ.get(name, "") or "").strip():
            os.environ[name] = value


__all__ = ["apply_secret_file_overrides", "resolve_secret"]
