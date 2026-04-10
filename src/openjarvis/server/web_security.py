"""Deployment-aware web security helpers for JARVIS."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urlparse

from fastapi import Request

LOCAL_WEB_ORIGINS = [
    "http://127.0.0.1",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
    "http://localhost",
    "http://localhost:4173",
    "http://localhost:5173",
    "http://localhost:8000",
]

LOCAL_WEB_HOSTS = [
    "127.0.0.1",
    "localhost",
    "testserver",
]


@dataclass(frozen=True)
class CookieSettings:
    secure: bool
    same_site: str
    domain: str | None
    max_age: int = 60 * 60 * 24 * 30


class AuthRateLimiter:
    """Small in-memory limiter for auth-sensitive endpoints."""

    def __init__(self, *, max_attempts: int = 8, window_seconds: int = 15 * 60) -> None:
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = {}

    def check(self, key: str) -> tuple[bool, int]:
        now = time.time()
        window_start = now - self._window_seconds
        attempts = [stamp for stamp in self._attempts.get(key, []) if stamp >= window_start]
        self._attempts[key] = attempts
        if len(attempts) >= self._max_attempts:
            retry_after = max(1, int(self._window_seconds - (now - attempts[0])))
            return False, retry_after
        return True, 0

    def record_failure(self, key: str) -> None:
        now = time.time()
        window_start = now - self._window_seconds
        attempts = [stamp for stamp in self._attempts.get(key, []) if stamp >= window_start]
        attempts.append(now)
        self._attempts[key] = attempts

    def reset(self, key: str) -> None:
        self._attempts.pop(key, None)


class ApiRateLimiter:
    """Small in-memory limiter for authenticated mutation endpoints."""

    def __init__(self, *, max_attempts: int = 180, window_seconds: int = 60) -> None:
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = {}

    def check(self, key: str) -> tuple[bool, int]:
        now = time.time()
        window_start = now - self._window_seconds
        attempts = [stamp for stamp in self._attempts.get(key, []) if stamp >= window_start]
        self._attempts[key] = attempts
        if len(attempts) >= self._max_attempts:
            retry_after = max(1, int(self._window_seconds - (now - attempts[0])))
            return False, retry_after
        attempts.append(now)
        self._attempts[key] = attempts
        return True, 0


def resolve_cookie_settings(request: Request) -> CookieSettings:
    secure = _env_flag("OPENJARVIS_SECURE_COOKIES")
    if not secure:
        secure = _request_uses_https(request)
    same_site = (os.environ.get("OPENJARVIS_COOKIE_SAMESITE", "") or "").strip().lower()
    if same_site not in {"lax", "strict", "none"}:
        same_site = "none" if secure else "lax"
    if same_site == "none":
        secure = True
    domain = (os.environ.get("OPENJARVIS_COOKIE_DOMAIN", "") or "").strip() or None
    max_age = _env_int("OPENJARVIS_SESSION_MAX_AGE", 60 * 60 * 24 * 30)
    return CookieSettings(secure=secure, same_site=same_site, domain=domain, max_age=max_age)


def resolve_cors_origins(explicit_origins: Iterable[str] | None = None) -> list[str]:
    if explicit_origins is not None:
        origins = [origin.strip() for origin in explicit_origins if origin and origin.strip()]
        return origins or LOCAL_WEB_ORIGINS.copy()

    env_origins = (os.environ.get("OPENJARVIS_ALLOWED_ORIGINS", "") or "").strip()
    if env_origins:
        origins = [origin.strip() for origin in env_origins.split(",") if origin.strip()]
        if origins:
            return origins

    public_url = (os.environ.get("OPENJARVIS_PUBLIC_URL", "") or "").strip()
    if public_url:
        parsed = urlparse(public_url)
        if parsed.scheme and parsed.netloc:
            return [f"{parsed.scheme}://{parsed.netloc}", *LOCAL_WEB_ORIGINS]

    return LOCAL_WEB_ORIGINS.copy()


def resolve_allowed_hosts(explicit_hosts: Iterable[str] | None = None) -> list[str]:
    if explicit_hosts is not None:
        hosts = [host.strip() for host in explicit_hosts if host and host.strip()]
        return hosts or LOCAL_WEB_HOSTS.copy()

    env_hosts = (os.environ.get("OPENJARVIS_ALLOWED_HOSTS", "") or "").strip()
    if env_hosts:
        hosts = [host.strip() for host in env_hosts.split(",") if host.strip()]
        if hosts:
            return hosts

    public_url = (os.environ.get("OPENJARVIS_PUBLIC_URL", "") or "").strip()
    if public_url:
        parsed = urlparse(public_url)
        host = parsed.hostname or ""
        if host:
            return [host, *LOCAL_WEB_HOSTS]

    return LOCAL_WEB_HOSTS.copy()


def _request_uses_https(request: Request) -> bool:
    proto = (request.headers.get("x-forwarded-proto", "") or "").split(",")[0].strip().lower()
    if proto == "https":
        return True
    return request.url.scheme.lower() == "https"


def _env_flag(name: str) -> bool:
    value = (os.environ.get(name, "") or "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name, "") or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


__all__ = [
    "ApiRateLimiter",
    "AuthRateLimiter",
    "CookieSettings",
    "LOCAL_WEB_ORIGINS",
    "LOCAL_WEB_HOSTS",
    "resolve_cookie_settings",
    "resolve_cors_origins",
    "resolve_allowed_hosts",
]
