"""Tests for security middleware -- HTTP security headers and request guards."""

from __future__ import annotations

from unittest.mock import patch

from openjarvis.server.auth import SESSION_COOKIE_NAME
from openjarvis.server.web_security import ApiRateLimiter
from openjarvis.server.middleware import (
    SECURITY_HEADERS,
    create_api_rate_limit_middleware,
    create_csrf_middleware,
    create_security_middleware,
)


class TestSecurityHeaders:
    """Tests for security headers middleware."""

    def test_headers_dict(self) -> None:
        """Verify SECURITY_HEADERS has all expected keys."""
        expected_keys = {
            "X-Content-Type-Options",
            "X-Frame-Options",
            "X-XSS-Protection",
            "Strict-Transport-Security",
            "Referrer-Policy",
            "Permissions-Policy",
            "Content-Security-Policy",
        }
        assert set(SECURITY_HEADERS.keys()) == expected_keys

    def test_create_middleware_without_starlette(self) -> None:
        """When starlette is not available, returns None."""
        import importlib

        import openjarvis.server.middleware as mod

        blocked = {
            "starlette": None,
            "starlette.middleware": None,
            "starlette.middleware.base": None,
            "starlette.requests": None,
            "starlette.responses": None,
        }
        with patch.dict("sys.modules", blocked):
            importlib.reload(mod)
            result = mod.create_security_middleware()
            assert result is None
            # Reload again to restore normal state
            importlib.reload(mod)

    def test_create_middleware_with_starlette(self) -> None:
        """When starlette is available, returns a class."""
        middleware_cls = create_security_middleware()
        if middleware_cls is None:
            # starlette not installed -- skip
            import pytest

            pytest.skip("starlette not available")
        assert middleware_cls is not None
        assert callable(middleware_cls)

    def test_middleware_adds_headers(self) -> None:
        """Middleware adds all security headers to responses."""
        import pytest

        fastapi = pytest.importorskip("fastapi")
        from fastapi.testclient import TestClient

        app = fastapi.FastAPI()

        middleware_cls = create_security_middleware()
        assert middleware_cls is not None
        app.add_middleware(middleware_cls)

        @app.get("/test")
        def test_endpoint() -> dict:
            return {"ok": True}

        client = TestClient(app)
        resp = client.get("/test")
        assert resp.status_code == 200

        for header_name, header_value in SECURITY_HEADERS.items():
            assert resp.headers.get(header_name) == header_value, (
                f"Missing or wrong header: {header_name}"
            )

    def test_middleware_skips_options(self) -> None:
        """OPTIONS requests pass through without security headers."""
        import pytest

        fastapi = pytest.importorskip("fastapi")
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.testclient import TestClient

        app = fastapi.FastAPI()

        # Add CORS first, then security (reverse execution order)
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )
        middleware_cls = create_security_middleware()
        assert middleware_cls is not None
        app.add_middleware(middleware_cls)

        @app.post("/test")
        def test_endpoint() -> dict:
            return {"ok": True}

        client = TestClient(app)
        resp = client.options(
            "/test",
            headers={
                "Origin": "https://tauri.localhost",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers
        # Security headers should NOT be present on preflight
        assert "X-Frame-Options" not in resp.headers

    def test_csrf_middleware_blocks_cross_site_cookie_post(self) -> None:
        import pytest

        fastapi = pytest.importorskip("fastapi")
        from fastapi.testclient import TestClient

        app = fastapi.FastAPI()
        middleware_cls = create_csrf_middleware(["http://localhost:5173"])
        assert middleware_cls is not None
        app.add_middleware(middleware_cls)

        @app.post("/v1/protected")
        def protected() -> dict:
            return {"ok": True}

        client = TestClient(app)
        client.cookies.set(SESSION_COOKIE_NAME, "session-token")
        resp = client.post(
            "/v1/protected",
            headers={"Origin": "https://evil.example"},
        )
        assert resp.status_code == 403
        assert "cross-site" in resp.json()["detail"].lower()

    def test_csrf_middleware_allows_same_origin_cookie_post(self) -> None:
        import pytest

        fastapi = pytest.importorskip("fastapi")
        from fastapi.testclient import TestClient

        app = fastapi.FastAPI()
        middleware_cls = create_csrf_middleware(["http://localhost:5173"])
        assert middleware_cls is not None
        app.add_middleware(middleware_cls)

        @app.post("/v1/protected")
        def protected() -> dict:
            return {"ok": True}

        client = TestClient(app)
        client.cookies.set(SESSION_COOKIE_NAME, "session-token")
        resp = client.post(
            "/v1/protected",
            headers={"Origin": "http://localhost:5173"},
        )
        assert resp.status_code == 200

    def test_api_rate_limit_middleware_blocks_bursty_cookie_posts(self) -> None:
        import pytest

        fastapi = pytest.importorskip("fastapi")
        from fastapi.testclient import TestClient

        app = fastapi.FastAPI()
        app.state.api_rate_limiter = ApiRateLimiter(max_attempts=2, window_seconds=60)
        csrf_middleware_cls = create_csrf_middleware(["http://localhost:5173"])
        rate_limit_middleware_cls = create_api_rate_limit_middleware()
        assert csrf_middleware_cls is not None
        assert rate_limit_middleware_cls is not None
        app.add_middleware(rate_limit_middleware_cls)
        app.add_middleware(csrf_middleware_cls)

        @app.post("/v1/protected")
        def protected() -> dict:
            return {"ok": True}

        client = TestClient(app)
        client.cookies.set(SESSION_COOKIE_NAME, "session-token")
        headers = {"Origin": "http://localhost:5173"}
        first = client.post("/v1/protected", headers=headers)
        second = client.post("/v1/protected", headers=headers)
        third = client.post("/v1/protected", headers=headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert third.status_code == 429
        assert "slow down" in third.json()["detail"].lower()

    def test_api_rate_limit_middleware_skips_voice_routes(self) -> None:
        import pytest

        fastapi = pytest.importorskip("fastapi")
        from fastapi.testclient import TestClient

        app = fastapi.FastAPI()
        app.state.api_rate_limiter = ApiRateLimiter(max_attempts=1, window_seconds=60)
        rate_limit_middleware_cls = create_api_rate_limit_middleware()
        assert rate_limit_middleware_cls is not None
        app.add_middleware(rate_limit_middleware_cls)

        @app.post("/v1/voice-loop/interrupt")
        def interrupt() -> dict:
            return {"ok": True}

        client = TestClient(app)
        client.cookies.set(SESSION_COOKIE_NAME, "session-token")
        first = client.post("/v1/voice-loop/interrupt")
        second = client.post("/v1/voice-loop/interrupt")

        assert first.status_code == 200
        assert second.status_code == 200
