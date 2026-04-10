"""Security middleware -- HTTP security headers and request guards."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from openjarvis.server.auth import SESSION_COOKIE_NAME

__all__ = [
    "SECURITY_HEADERS",
    "create_api_rate_limit_middleware",
    "create_csrf_middleware",
    "create_security_middleware",
]

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_EXEMPT_PREFIXES = ("/health", "/docs", "/openapi.json", "/webhooks/")
_RATE_LIMIT_EXEMPT_PREFIXES = (
    "/health",
    "/docs",
    "/openapi.json",
    "/webhooks/",
    "/v1/speech/",
    "/v1/voice-loop/",
)


def create_security_middleware() -> Any:
    """Create a FastAPI middleware that adds security headers.

    Returns a middleware class/callable, or None if FastAPI is not available.

    Headers added:
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - X-XSS-Protection: 1; mode=block
    - Strict-Transport-Security: max-age=31536000; includeSubDomains
    - Referrer-Policy: strict-origin-when-cross-origin
    - Permissions-Policy: camera=(), microphone=(self), geolocation=()

    OPTIONS requests are passed through without headers so that
    CORS preflight is not blocked.
    """
    try:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.requests import Request
        from starlette.responses import Response
    except ImportError:
        return None

    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Any) -> Response:
            # Let CORS preflight requests pass through without
            # security headers that would conflict with CORS.
            if request.method == "OPTIONS":
                return await call_next(request)

            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = (
                "camera=(), microphone=(self), geolocation=()"
            )
            response.headers["Content-Security-Policy"] = "default-src 'self'"
            return response

    return SecurityHeadersMiddleware


def create_csrf_middleware(allowed_origins: list[str]) -> Any:
    """Protect cookie-authenticated state-changing requests from cross-site use."""

    try:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.requests import Request
        from starlette.responses import JSONResponse, Response
    except ImportError:
        return None

    normalized_allowed = {
        _normalize_origin(origin)
        for origin in allowed_origins
        if _normalize_origin(origin)
    }

    class CsrfProtectionMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Any) -> Response:
            if (
                request.method in _SAFE_METHODS
                or any(request.url.path.startswith(prefix) for prefix in _CSRF_EXEMPT_PREFIXES)
                or not request.url.path.startswith("/v1/")
            ):
                return await call_next(request)

            if request.headers.get("Authorization", "").strip():
                return await call_next(request)

            if not request.cookies.get(SESSION_COOKIE_NAME, "").strip():
                return await call_next(request)

            origin = _normalize_origin(request.headers.get("Origin", ""))
            referer = _normalize_origin(request.headers.get("Referer", ""))
            candidate = origin or referer
            if not candidate or candidate not in normalized_allowed:
                return JSONResponse({"detail": "Cross-site request blocked"}, status_code=403)

            return await call_next(request)

    return CsrfProtectionMiddleware


def create_api_rate_limit_middleware() -> Any:
    """Protect authenticated mutation endpoints from request bursts."""

    try:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.requests import Request
        from starlette.responses import JSONResponse, Response
    except ImportError:
        return None

    class ApiRateLimitMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Any) -> Response:
            if request.method in _SAFE_METHODS or any(
                request.url.path.startswith(prefix) for prefix in _RATE_LIMIT_EXEMPT_PREFIXES
            ):
                return await call_next(request)

            if not request.url.path.startswith("/v1/"):
                return await call_next(request)

            limiter = getattr(request.app.state, "api_rate_limiter", None)
            if limiter is None:
                return await call_next(request)

            identity = _rate_limit_identity(request)
            if not identity:
                return await call_next(request)

            key = f"{request.method}:{request.url.path}:{identity}"
            allowed, retry_after = limiter.check(key)
            if not allowed:
                return JSONResponse(
                    {"detail": "Too many requests. Please slow down and try again."},
                    status_code=429,
                    headers={"Retry-After": str(retry_after)},
                )

            return await call_next(request)

    return ApiRateLimitMiddleware


def _normalize_origin(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}".lower()
    return ""


def _rate_limit_identity(request) -> str:
    authorization = (request.headers.get("Authorization", "") or "").strip()
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            return f"bearer:{token[:16]}"
    session_token = (request.cookies.get(SESSION_COOKIE_NAME, "") or "").strip()
    if session_token:
        return f"session:{session_token[:24]}"
    forwarded_for = (request.headers.get("x-forwarded-for", "") or "").split(",")[0].strip()
    client_host = forwarded_for or (request.client.host if request.client else "")
    return f"ip:{client_host}" if client_host else ""


# Also export the header values as constants for testing
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    "Content-Security-Policy": "default-src 'self'",
}
