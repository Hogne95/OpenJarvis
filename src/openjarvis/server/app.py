"""FastAPI application factory for the OpenJarvis API server."""

from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import pathlib
import time

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from openjarvis.server.api_routes import include_all_routes
from openjarvis.server.action_center import ActionCenterManager
from openjarvis.server.auth_routes import create_auth_router
from openjarvis.server.connector_account_store import ConnectorAccountStore
from openjarvis.server.coding_workspace import CodingWorkspaceManager
from openjarvis.server.comparison import comparison_router
from openjarvis.server.connectors_router import create_connectors_router
from openjarvis.server.dashboard import dashboard_router
from openjarvis.server.digest_routes import create_digest_router
from openjarvis.server.jarvis_intent import create_jarvis_intent_router
from openjarvis.server.operator_memory import OperatorMemory
from openjarvis.server.repo_registry import RepoRegistry
from openjarvis.server.routes import router
from openjarvis.server.upload_router import router as upload_router
from openjarvis.server.user_store import UserStore
from openjarvis.server.voice_loop import VoiceLoopManager
from openjarvis.server.web_security import (
    ApiRateLimiter,
    AuthRateLimiter,
    resolve_allowed_hosts,
    resolve_cors_origins,
)
from openjarvis.server.workbench import WorkbenchManager

logger = logging.getLogger(__name__)


def _shutdown_background_services(app: FastAPI) -> None:
    """Stop optional background services during app shutdown.

    Root cause: FastAPI's deprecated ``@app.on_event("shutdown")`` hook was
    still handling scheduler cleanup. Moving that logic into the app lifespan
    keeps shutdown behavior explicit without carrying deprecation noise through
    every server test.
    """
    scheduler = getattr(app.state, "task_scheduler", None)
    if scheduler is not None:
        try:
            scheduler.stop()
        except Exception:
            logger.debug("Task scheduler shutdown skipped", exc_info=True)
    scheduler_store = getattr(app.state, "task_scheduler_store", None)
    if scheduler_store is not None:
        try:
            scheduler_store.close()
        except Exception:
            logger.debug("Task scheduler store close skipped", exc_info=True)
    user_store = getattr(app.state, "user_store", None)
    if user_store is not None:
        try:
            user_store.close()
        except Exception:
            logger.debug("User store close skipped", exc_info=True)
    connector_account_store = getattr(app.state, "connector_account_store", None)
    if connector_account_store is not None:
        try:
            connector_account_store.close()
        except Exception:
            logger.debug("Connector account store close skipped", exc_info=True)


def _bootstrap_core_agent_architecture(app: FastAPI) -> None:
    """Provision the core JARVIS role agents if the manager is available.

    Root cause: the HUD expects planner/executor/vision roles to exist, but
    they were only created lazily through explicit architecture actions.
    Bootstrapping them at startup makes agent availability match the product's
    default UX expectations.
    """
    try:
        manager = getattr(app.state, "agent_manager", None)
        if manager is None:
            return
        from openjarvis.server.agent_architecture import ensure_core_team

        status = ensure_core_team(app.state)
        created = status.get("created", []) or []
        existing = status.get("existing", []) or []
        logger.info(
            "Core JARVIS agents ready (created=%s existing=%s)",
            len(created),
            len(existing),
        )
    except Exception as exc:
        logger.warning("Core JARVIS agent bootstrap skipped: %s", exc)


def _restore_sendblue_bindings(app: FastAPI) -> None:
    """Restore SendBlue channel bindings from the database on startup.

    If a SendBlue binding was created via the Messaging tab and the server
    restarts, this ensures the ChannelBridge + DeepResearchAgent are wired
    up so incoming webhooks continue to work.
    """
    try:
        mgr = getattr(app.state, "agent_manager", None)
        if mgr is None:
            return

        # Check all agents for sendblue bindings
        for agent in mgr.list_agents():
            agent_id = agent.get("id", agent.get("agent_id", ""))
            bindings = mgr.list_channel_bindings(agent_id)
            for b in bindings:
                if b.get("channel_type") != "sendblue":
                    continue
                config = b.get("config", {})
                api_key_id = config.get("api_key_id", "")
                api_secret_key = config.get("api_secret_key", "")
                from_number = config.get("from_number", "")
                if not api_key_id or not api_secret_key:
                    continue

                from openjarvis.channels.sendblue import SendBlueChannel

                sb = SendBlueChannel(
                    api_key_id=api_key_id,
                    api_secret_key=api_secret_key,
                    from_number=from_number,
                )
                sb.connect()
                app.state.sendblue_channel = sb

                # Create ChannelBridge if none exists
                bridge = getattr(app.state, "channel_bridge", None)
                if bridge and hasattr(bridge, "_channels"):
                    bridge._channels["sendblue"] = sb
                else:
                    from openjarvis.server.channel_bridge import ChannelBridge
                    from openjarvis.server.session_store import SessionStore

                    session_store = SessionStore()
                    engine = getattr(app.state, "engine", None)
                    dr_agent = None
                    if engine:
                        from openjarvis.server.agent_manager_routes import (
                            _build_deep_research_tools,
                        )

                        tools = _build_deep_research_tools(engine=engine, model="")
                        if tools:
                            from openjarvis.agents.deep_research import (
                                DeepResearchAgent,
                            )

                            model_name = getattr(app.state, "model", "") or getattr(
                                engine, "_model", ""
                            )
                            dr_agent = DeepResearchAgent(
                                engine=engine,
                                model=model_name,
                                tools=tools,
                            )

                    bus = getattr(app.state, "bus", None)
                    if bus is None:
                        from openjarvis.core.events import EventBus

                        bus = EventBus()

                    app.state.channel_bridge = ChannelBridge(
                        channels={"sendblue": sb},
                        session_store=session_store,
                        bus=bus,
                        agent_manager=mgr,
                        deep_research_agent=dr_agent,
                    )

                logger.info(
                    "Restored SendBlue channel binding: %s",
                    from_number,
                )
                return  # Only need one SendBlue binding
    except Exception as exc:
        logger.debug("SendBlue binding restore skipped: %s", exc)


# No-cache headers applied to static file responses
_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


class _NoCacheStaticFiles(StaticFiles):
    """StaticFiles subclass that adds no-cache headers to every response."""

    async def __call__(self, scope, receive, send):
        async def _send_with_headers(message):
            if message["type"] == "http.response.start":
                extra = [(k.encode(), v.encode()) for k, v in _NO_CACHE_HEADERS.items()]
                # Remove etag and last-modified
                existing = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() not in (b"etag", b"last-modified")
                ]
                message = {**message, "headers": existing + extra}
            await send(message)

        await super().__call__(scope, receive, _send_with_headers)


def create_app(
    engine,
    model: str,
    *,
    agent=None,
    bus=None,
    engine_name: str = "",
    agent_name: str = "",
    channel_bridge=None,
    config=None,
    memory_backend=None,
    speech_backend=None,
    agent_manager=None,
    agent_scheduler=None,
    task_scheduler=None,
    task_scheduler_store=None,
    api_key: str = "",
    webhook_config: dict | None = None,
    cors_origins: list[str] | None = None,
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
    channel_bridge:
        Optional channel bridge for multi-platform messaging.
    config:
        Optional JarvisConfig for other settings.
    """
    @asynccontextmanager
    async def _app_lifespan(app: FastAPI):
        try:
            yield
        finally:
            _shutdown_background_services(app)

    app = FastAPI(
        title="OpenJarvis API",
        description="OpenAI-compatible API server for OpenJarvis",
        version="0.1.0",
        lifespan=_app_lifespan,
    )

    from fastapi.middleware.cors import CORSMiddleware
    from starlette.middleware.trustedhost import TrustedHostMiddleware

    _origins = resolve_cors_origins(cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=resolve_allowed_hosts(),
    )

    # Store dependencies in app state
    app.state.engine = engine
    app.state.model = model
    app.state.agent = agent
    app.state.bus = bus
    app.state.engine_name = engine_name
    app.state.agent_name = agent_name or (
        getattr(agent, "agent_id", None) if agent else None
    )
    app.state.channel_bridge = channel_bridge
    app.state.config = config
    app.state.memory_backend = memory_backend
    app.state.speech_backend = speech_backend
    speech_cfg = getattr(config, "speech", None)
    language_hints = (
        [h.strip() for h in speech_cfg.language_hints.split(",") if h.strip()]
        if speech_cfg and getattr(speech_cfg, "language_hints", "")
        else ["no", "en"]
    )
    wake_phrases = (
        [p.strip() for p in speech_cfg.wake_phrases.split(",") if p.strip()]
        if speech_cfg and getattr(speech_cfg, "wake_phrases", "")
        else ["hey jarvis", "ok jarvis", "jarvis", "hei jarvis"]
    )
    app.state.voice_loop = VoiceLoopManager(
        speech_backend=speech_backend,
        language_hints=language_hints,
        wake_phrases=wake_phrases,
        wake_required=getattr(speech_cfg, "require_wake_phrase", True),
        live_vad_enabled=getattr(speech_cfg, "live_vad_enabled", True),
        vad_backend=getattr(speech_cfg, "vad_backend", "auto"),
        vad_threshold=getattr(speech_cfg, "vad_threshold", 0.016),
        vad_min_speech_ms=getattr(speech_cfg, "vad_min_speech_ms", 250),
        wake_backend=getattr(speech_cfg, "wake_backend", "transcript"),
        wake_model_path=getattr(speech_cfg, "wake_model_path", ""),
        wake_threshold=getattr(speech_cfg, "wake_threshold", 0.5),
    )
    from openjarvis.core.config import DEFAULT_CONFIG_DIR

    repo_registry = RepoRegistry(
        storage_path=DEFAULT_CONFIG_DIR / "workspace_repos.json",
        default_root=str(pathlib.Path.cwd()),
    )
    app.state.workspace_registry = repo_registry
    app.state.workbench = WorkbenchManager(default_working_dir=repo_registry.active_root())
    app.state.coding_workspace = CodingWorkspaceManager()
    app.state.action_center = ActionCenterManager()
    app.state.operator_memory = OperatorMemory()
    app.state.agent_manager = agent_manager
    app.state.agent_scheduler = agent_scheduler
    app.state.task_scheduler = task_scheduler
    app.state.task_scheduler_store = task_scheduler_store
    app.state.session_start = time.time()
    app.state.user_store = UserStore()
    app.state.connector_account_store = ConnectorAccountStore()
    app.state.auth_rate_limiter = AuthRateLimiter()
    app.state.api_rate_limiter = ApiRateLimiter()

    # Wire up trace store if traces are enabled
    app.state.trace_store = None
    try:
        from openjarvis.core.config import load_config
        from openjarvis.traces.store import TraceStore

        cfg = config if config is not None else load_config()
        if cfg.traces.enabled:
            _trace_store = TraceStore(db_path=cfg.traces.db_path)
            app.state.trace_store = _trace_store
            _bus = getattr(app.state, "bus", None)
            if _bus is not None:
                _trace_store.subscribe_to_bus(_bus)
    except Exception:
        pass  # traces are optional; don't block server startup

    app.include_router(router)
    app.include_router(create_auth_router())
    app.include_router(dashboard_router)
    app.include_router(comparison_router)
    app.include_router(create_connectors_router(), prefix="/v1")
    app.include_router(create_digest_router())
    app.include_router(create_jarvis_intent_router())
    app.include_router(upload_router)
    include_all_routes(app)

    # Bootstrap the planner/executor/vision roles expected by the HUD.
    _bootstrap_core_agent_architecture(app)

    # Restore SendBlue channel bindings from database on startup
    _restore_sendblue_bindings(app)

    # Add security headers middleware
    try:
        from openjarvis.server.middleware import (
            create_api_rate_limit_middleware,
            create_csrf_middleware,
            create_security_middleware,
        )

        middleware_cls = create_security_middleware()
        if middleware_cls is not None:
            app.add_middleware(middleware_cls)
        api_rate_limit_middleware_cls = create_api_rate_limit_middleware()
        if api_rate_limit_middleware_cls is not None:
            app.add_middleware(api_rate_limit_middleware_cls)
        csrf_middleware_cls = create_csrf_middleware(_origins)
        if csrf_middleware_cls is not None:
            app.add_middleware(csrf_middleware_cls)
    except Exception as exc:
        logger.debug("Security middleware init skipped: %s", exc)

    # API key authentication middleware
    if api_key:
        try:
            from openjarvis.server.auth_middleware import AuthMiddleware

            app.add_middleware(AuthMiddleware, api_key=api_key)
        except Exception as exc:
            logger.debug("Auth middleware init skipped: %s", exc)

    # Mount webhook routes (always — SendBlue may be configured dynamically)
    if webhook_config:
        try:
            from openjarvis.server.webhook_routes import (
                create_webhook_router,
            )

            webhook_router = create_webhook_router(
                bridge=channel_bridge,
                twilio_auth_token=webhook_config.get("twilio_auth_token", ""),
                bluebubbles_password=webhook_config.get("bluebubbles_password", ""),
                whatsapp_verify_token=webhook_config.get("whatsapp_verify_token", ""),
                whatsapp_app_secret=webhook_config.get("whatsapp_app_secret", ""),
            )
            app.include_router(webhook_router)
        except Exception as exc:
            logger.debug("Webhook routes init skipped: %s", exc)

    # Serve static frontend assets if the static/ directory exists
    static_dir = pathlib.Path(__file__).parent / "static"
    if static_dir.is_dir():
        assets_dir = static_dir / "assets"
        if assets_dir.is_dir():
            app.mount(
                "/assets",
                _NoCacheStaticFiles(directory=assets_dir),
                name="static-assets",
            )

        @app.get("/{full_path:path}")
        async def spa_catch_all(full_path: str):
            """Serve static files directly, fall back to index.html for SPA routes."""
            if full_path:
                candidate = (static_dir / full_path).resolve()
                # Path traversal prevention
                resolved_root = static_dir.resolve()
                if candidate.is_relative_to(resolved_root) and candidate.is_file():
                    return FileResponse(candidate, headers=_NO_CACHE_HEADERS)
            return FileResponse(
                static_dir / "index.html",
                headers=_NO_CACHE_HEADERS,
            )

    return app


__all__ = ["create_app"]
