"""FastAPI application factory for the OpenJarvis API server."""

from __future__ import annotations

import pathlib

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from openjarvis.server.dashboard import dashboard_router
from openjarvis.server.routes import router


def create_app(
    engine,
    model: str,
    *,
    agent=None,
    bus=None,
    engine_name: str = "",
    agent_name: str = "",
) -> FastAPI:
    """Create and configure the FastAPI application.

    Parameters
    ----------
    engine:
        The inference engine to use for completions.
    model:
        Default model name.
    agent:
        Optional agent instance for agent-mode completions.
    bus:
        Optional event bus for telemetry.
    """
    app = FastAPI(
        title="OpenJarvis API",
        description="OpenAI-compatible API server for OpenJarvis",
        version="1.0.0",
    )

    # Store dependencies in app state
    app.state.engine = engine
    app.state.model = model
    app.state.agent = agent
    app.state.bus = bus
    app.state.engine_name = engine_name
    app.state.agent_name = agent_name or (getattr(agent, "agent_id", None) if agent else None)

    app.include_router(router)
    app.include_router(dashboard_router)

    # Serve static frontend assets if the static/ directory exists
    static_dir = pathlib.Path(__file__).parent / "static"
    if static_dir.is_dir():
        assets_dir = static_dir / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

        @app.get("/{full_path:path}")
        async def spa_catch_all(full_path: str):
            """Serve index.html for SPA routes not handled by API endpoints."""
            # Let API and known routes pass through (handled by routers above)
            api_prefixes = ("v1/", "health", "dashboard", "assets")
            if full_path.startswith(api_prefixes):
                return FileResponse(static_dir / "index.html")
            return FileResponse(static_dir / "index.html")

    return app


__all__ = ["create_app"]
