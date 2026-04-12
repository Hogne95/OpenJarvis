"""FastAPI router for /v1/connectors — connector management endpoints."""

from __future__ import annotations

import base64
import inspect
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

try:
    from fastapi import Request as FastAPIRequest
except ImportError:  # pragma: no cover - optional dependency at import time
    FastAPIRequest = Any  # type: ignore[assignment]

# Module-level cache of connector instances (keyed by connector_id).
_instances: Dict[str, Any] = {}
_chunk_count_cache: Dict[str, int] = {}
_chunk_count_cache_at: Dict[str, float] = {}
_CHUNK_COUNT_CACHE_TTL_SECONDS = 15.0


def _ensure_connectors_registered() -> None:
    """Ensure ConnectorRegistry is populated.

    If the registry has been cleared (e.g. by test fixtures) but connector
    modules are already cached in sys.modules, reload each submodule to
    re-execute their @ConnectorRegistry.register decorators.
    """
    import importlib
    import sys

    from openjarvis.core.registry import ConnectorRegistry
    from openjarvis.core.config import DEFAULT_CONFIG_DIR

    # First, try a normal import (works if modules haven't been imported yet).
    try:
        import openjarvis.connectors  # noqa: F401
    except Exception:
        pass

    # If the registry is still empty, reload individual connector submodules
    # that are already present in sys.modules.
    if not ConnectorRegistry.keys():
        for mod_name in list(sys.modules):
            if (
                mod_name.startswith("openjarvis.connectors.")
                and not mod_name.endswith("_stubs")
                and not mod_name.endswith("pipeline")
                and not mod_name.endswith("store")
                and not mod_name.endswith("chunker")
                and not mod_name.endswith("retriever")
                and not mod_name.endswith("sync_engine")
                and not mod_name.endswith("oauth")
            ):
                try:
                    importlib.reload(sys.modules[mod_name])
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# Pydantic request model — defined at module level so FastAPI can resolve
# the type annotation correctly when injecting request bodies.
# ---------------------------------------------------------------------------

try:
    from pydantic import BaseModel as _BaseModel

    class ConnectRequest(_BaseModel):
        """Credentials / connection parameters for a connector."""

        path: Optional[str] = None
        token: Optional[str] = None
        code: Optional[str] = None
        email: Optional[str] = None
        password: Optional[str] = None

    class ConnectorAccountCreateRequest(_BaseModel):
        provider: str
        label: str
        account_type: Optional[str] = None
        external_identity: Optional[str] = None
        status: Optional[str] = None
        metadata: Optional[Dict[str, Any]] = None

    class ConnectorAccountUpdateRequest(_BaseModel):
        provider: Optional[str] = None
        label: Optional[str] = None
        account_type: Optional[str] = None
        external_identity: Optional[str] = None
        status: Optional[str] = None
        metadata: Optional[Dict[str, Any]] = None

except ImportError:
    ConnectRequest = None  # type: ignore[assignment,misc]
    ConnectorAccountCreateRequest = None  # type: ignore[assignment,misc]
    ConnectorAccountUpdateRequest = None  # type: ignore[assignment,misc]


def create_connectors_router():
    """Return an APIRouter with /connectors endpoints.

    Importing FastAPI inside the factory avoids a hard import-time
    dependency and mirrors the pattern used by other optional routers in
    this package.
    """
    try:
        from fastapi import APIRouter, HTTPException
    except ImportError as exc:
        raise ImportError(
            "fastapi and pydantic are required for the connectors router"
        ) from exc

    if ConnectRequest is None or ConnectorAccountCreateRequest is None or ConnectorAccountUpdateRequest is None:
        raise ImportError("pydantic is required for the connectors router")

    from openjarvis.core.config import DEFAULT_CONFIG_DIR
    from openjarvis.core.registry import ConnectorRegistry
    from openjarvis.server.auth import require_current_user_if_bootstrapped, require_role_if_bootstrapped

    router = APIRouter(prefix="/connectors", tags=["connectors"])

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _instance_cache_key(
        connector_id: str,
        *,
        owner_user_id: str = "",
        account_key: str = "",
    ) -> str:
        if owner_user_id and account_key:
            return f"{connector_id}::user={owner_user_id}::account={account_key}"
        return connector_id

    def _account_credentials_path(owner_user_id: str, account_id: str, connector_id: str) -> str:
        scoped_dir = (
            DEFAULT_CONFIG_DIR
            / "connectors"
            / "accounts"
            / owner_user_id
            / account_id
        )
        scoped_dir.mkdir(parents=True, exist_ok=True)
        return str(scoped_dir / f"{connector_id}.json")

    def _resolve_account(
        request: FastAPIRequest,
        account_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        if not account_id:
            return None
        user = require_current_user_if_bootstrapped(request)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        store = getattr(request.app.state, "connector_account_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="Connector account store not configured")
        account = store.get_account(account_id, owner_user_id=str(user["id"]))
        if account is None:
            raise HTTPException(status_code=404, detail="Connector account not found")
        return account

    def _encode_oauth_state(*, account_id: str = "") -> str:
        payload = {"account_id": account_id}
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii")

    def _decode_oauth_state(state: str) -> Dict[str, str]:
        if not state:
            return {}
        try:
            padded = state + "=" * (-len(state) % 4)
            raw = base64.urlsafe_b64decode(padded.encode("ascii"))
            data = json.loads(raw.decode("utf-8"))
            if isinstance(data, dict):
                return {str(k): str(v) for k, v in data.items()}
        except Exception:
            return {}
        return {}

    def _instantiate_connector(
        connector_id: str,
        *,
        owner_user_id: str = "",
        account_key: str = "",
    ) -> Any:
        cls = ConnectorRegistry.get(connector_id)
        kwargs: Dict[str, Any] = {}
        if owner_user_id and account_key:
            credentials_path = _account_credentials_path(owner_user_id, account_key, connector_id)
            try:
                params = inspect.signature(cls.__init__).parameters
            except (TypeError, ValueError):
                params = {}
            if "credentials_path" in params:
                kwargs["credentials_path"] = credentials_path
            if "token_path" in params:
                kwargs["token_path"] = credentials_path
        return cls(**kwargs)

    def _get_or_create(
        connector_id: str,
        *,
        owner_user_id: str = "",
        account_key: str = "",
    ) -> Any:
        """Return a cached connector instance, creating it if needed."""
        cache_key = _instance_cache_key(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )
        if cache_key not in _instances:
            cls = ConnectorRegistry.get(connector_id)
            if cls is None:
                raise KeyError(connector_id)
            _instances[cache_key] = _instantiate_connector(
                connector_id,
                owner_user_id=owner_user_id,
                account_key=account_key,
            )
        return _instances[cache_key]

    def _invalidate_connector_cache(
        connector_id: str,
        *,
        owner_user_id: str = "",
        account_key: str = "",
    ) -> None:
        cache_key = _instance_cache_key(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )
        _instances.pop(cache_key, None)
        _chunk_count_cache.pop(cache_key, None)
        _chunk_count_cache_at.pop(cache_key, None)

    def _invalidate_chunk_cache(
        connector_id: str,
        *,
        owner_user_id: str = "",
        account_key: str = "",
    ) -> None:
        cache_key = _instance_cache_key(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )
        _chunk_count_cache.pop(cache_key, None)
        _chunk_count_cache_at.pop(cache_key, None)

    def _chunk_count(
        connector_id: str,
        *,
        owner_user_id: str = "",
        account_key: str = "",
    ) -> int:
        """Return cached knowledge chunk counts for connector summaries.

        Root cause: the HUD polls connector status frequently, and opening the
        knowledge store for every connector on every poll adds avoidable I/O.
        A short cache keeps the status card responsive without hiding real sync
        progress for long.
        """
        cache_key = _instance_cache_key(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )
        now = time.monotonic()
        cached_at = _chunk_count_cache_at.get(cache_key)
        if (
            cached_at is not None
            and now - cached_at < _CHUNK_COUNT_CACHE_TTL_SECONDS
        ):
            return _chunk_count_cache.get(cache_key, 0)

        chunks = 0
        try:
            from openjarvis.connectors.store import KnowledgeStore

            store = KnowledgeStore()
            where = ["source = ?"]
            params: list[Any] = [connector_id]
            if owner_user_id:
                where.append("owner_user_id = ?")
                params.append(owner_user_id)
            if account_key:
                where.append("account_key = ?")
                params.append(account_key)
            rows = store._conn.execute(
                f"SELECT COUNT(*) FROM knowledge_chunks WHERE {' AND '.join(where)}",
                params,
            ).fetchone()
            chunks = rows[0] if rows else 0
        except Exception:
            chunks = _chunk_count_cache.get(cache_key, 0)

        _chunk_count_cache[cache_key] = chunks
        _chunk_count_cache_at[cache_key] = now
        return chunks

    def _connector_summary(
        connector_id: str,
        instance: Any,
        *,
        owner_user_id: str = "",
        account_key: str = "",
    ) -> Dict[str, Any]:
        """Build the dict returned by GET /connectors."""
        return {
            "connector_id": connector_id,
            "display_name": getattr(instance, "display_name", connector_id),
            "auth_type": getattr(instance, "auth_type", "unknown"),
            "connected": instance.is_connected(),
            "chunks": _chunk_count(
                connector_id,
                owner_user_id=owner_user_id,
                account_key=account_key,
            ),
        }

    # ------------------------------------------------------------------
    # Endpoints
    # ------------------------------------------------------------------

    @router.get("/accounts")
    async def list_connector_accounts(request: FastAPIRequest):
        user = require_current_user_if_bootstrapped(request)
        if user is None:
            return {"accounts": []}
        store = getattr(request.app.state, "connector_account_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="Connector account store not configured")
        return {"accounts": store.list_accounts(str(user["id"]))}

    @router.post("/accounts")
    async def create_connector_account(req: ConnectorAccountCreateRequest, request: FastAPIRequest):
        user = require_current_user_if_bootstrapped(request)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        store = getattr(request.app.state, "connector_account_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="Connector account store not configured")
        try:
            return store.create_account(
                owner_user_id=str(user["id"]),
                provider=req.provider,
                label=req.label,
                account_type=req.account_type or "",
                external_identity=req.external_identity or "",
                status=req.status or "configured",
                metadata=req.metadata or {},
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @router.patch("/accounts/{account_id}")
    async def update_connector_account(
        account_id: str,
        req: ConnectorAccountUpdateRequest,
        request: FastAPIRequest,
    ):
        user = require_current_user_if_bootstrapped(request)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        store = getattr(request.app.state, "connector_account_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="Connector account store not configured")
        try:
            return store.update_account(
                account_id,
                owner_user_id=str(user["id"]),
                provider=req.provider,
                label=req.label,
                account_type=req.account_type,
                external_identity=req.external_identity,
                status=req.status,
                metadata=req.metadata,
            )
        except ValueError as exc:
            detail = str(exc)
            status_code = 404 if "not found" in detail.lower() else 400
            raise HTTPException(status_code=status_code, detail=detail)

    @router.delete("/accounts/{account_id}")
    async def delete_connector_account(account_id: str, request: FastAPIRequest):
        user = require_current_user_if_bootstrapped(request)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        store = getattr(request.app.state, "connector_account_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="Connector account store not configured")
        deleted = store.delete_account(account_id, owner_user_id=str(user["id"]))
        if not deleted:
            raise HTTPException(status_code=404, detail="Connector account not found")
        return {"deleted": True}

    @router.get("")
    async def list_connectors(request: FastAPIRequest, account_id: Optional[str] = None):
        """List all registered connectors with their connection status."""
        account = _resolve_account(request, account_id)
        if account is None:
            require_role_if_bootstrapped(request, "superadmin")
        _ensure_connectors_registered()
        owner_user_id = str(account["owner_user_id"]) if account is not None else ""
        account_key = str(account["id"]) if account is not None else ""
        results = []
        for key in sorted(ConnectorRegistry.keys()):
            try:
                instance = _get_or_create(
                    key,
                    owner_user_id=owner_user_id,
                    account_key=account_key,
                )
                results.append(
                    _connector_summary(
                        key,
                        instance,
                        owner_user_id=owner_user_id,
                        account_key=account_key,
                    )
                )
            except Exception:
                results.append(
                    {
                        "connector_id": key,
                        "display_name": key,
                        "auth_type": "unknown",
                        "connected": False,
                    }
                )
        return {"connectors": results}

    @router.get("/providers")
    async def list_connector_providers():
        from openjarvis.connectors.oauth import OAUTH_PROVIDERS, get_client_credentials

        providers = []
        for provider in OAUTH_PROVIDERS.values():
            providers.append(
                {
                    "provider": provider.name,
                    "display_name": provider.display_name,
                    "connector_ids": list(provider.connector_ids),
                    "setup_url": provider.setup_url,
                    "setup_hint": provider.setup_hint,
                    "has_credentials": get_client_credentials(provider) is not None,
                }
            )
        return {"providers": providers}

    @router.get("/{connector_id}")
    async def connector_detail(
        connector_id: str,
        request: FastAPIRequest,
        account_id: Optional[str] = None,
    ):
        """Return detail for a single connector."""
        account = _resolve_account(request, account_id)
        if account is None:
            require_role_if_bootstrapped(request, "superadmin")
        _ensure_connectors_registered()
        if not ConnectorRegistry.contains(connector_id):
            raise HTTPException(
                status_code=404,
                detail=f"Connector '{connector_id}' not found",
            )
        owner_user_id = str(account["owner_user_id"]) if account is not None else ""
        account_key = str(account["id"]) if account is not None else ""
        instance = _get_or_create(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )

        # Try to get an OAuth URL if applicable; ignore errors for non-OAuth
        # connectors.
        auth_url: Optional[str] = None
        try:
            auth_url = instance.auth_url()
        except (NotImplementedError, Exception):
            pass

        # Serialise MCP tool names only (ToolSpec objects are not JSON-safe).
        mcp_tools = []
        try:
            mcp_tools = [t.name for t in instance.mcp_tools()]
        except Exception:
            pass

        # Include OAuth provider setup info if applicable
        oauth_setup = None
        try:
            from openjarvis.connectors.oauth import (
                get_client_credentials,
                get_provider_for_connector,
            )

            provider = get_provider_for_connector(connector_id)
            if provider:
                has_creds = get_client_credentials(provider) is not None
                oauth_setup = {
                    "provider": provider.name,
                    "setup_url": provider.setup_url,
                    "setup_hint": provider.setup_hint,
                    "has_credentials": has_creds,
                }
        except Exception:
            pass

        return {
            "connector_id": connector_id,
            "display_name": getattr(instance, "display_name", connector_id),
            "auth_type": getattr(instance, "auth_type", "unknown"),
            "connected": instance.is_connected(),
            "auth_url": auth_url,
            "mcp_tools": mcp_tools,
            "oauth_setup": oauth_setup,
        }

    @router.post("/{connector_id}/connect")
    async def connect_connector(
        connector_id: str,
        req: ConnectRequest,
        request: FastAPIRequest,
        account_id: Optional[str] = None,
    ):
        """Connect a connector using the supplied credentials."""
        account = _resolve_account(request, account_id)
        if account is None:
            require_role_if_bootstrapped(request, "superadmin")
        _ensure_connectors_registered()
        if not ConnectorRegistry.contains(connector_id):
            raise HTTPException(
                status_code=404,
                detail=f"Connector '{connector_id}' not found",
            )
        owner_user_id = str(account["owner_user_id"]) if account is not None else ""
        account_key = str(account["id"]) if account is not None else ""
        instance = _get_or_create(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )

        try:
            auth_type = getattr(instance, "auth_type", "unknown")

            if auth_type == "filesystem":
                # Filesystem connectors accept a vault / directory path.
                if req.path:
                    instance._vault_path = req.path
                    from pathlib import Path

                    instance._connected = Path(req.path).is_dir()

            elif auth_type == "oauth":
                if req.code:
                    instance.handle_callback(req.code)
                elif req.token:
                    # Some OAuth connectors accept a pre-existing token.
                    if hasattr(instance, "_token"):
                        instance._token = req.token

            else:
                # Generic: try to store token or credentials if the instance
                # exposes the relevant attributes.
                if req.token and hasattr(instance, "_token"):
                    instance._token = req.token
                if req.email and hasattr(instance, "_email"):
                    instance._email = req.email
                if req.password and hasattr(instance, "_password"):
                    instance._password = req.password

        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        # Auto-ingest after successful connection
        if instance.is_connected():
            import threading

            def _ingest() -> None:
                try:
                    from openjarvis.connectors.pipeline import (
                        IngestionPipeline,
                    )
                    from openjarvis.connectors.store import KnowledgeStore
                    from openjarvis.connectors.sync_engine import SyncEngine

                    store = KnowledgeStore()
                    pipeline = IngestionPipeline(
                        store,
                        owner_user_id=owner_user_id,
                        account_key=account_key,
                    )
                    engine = SyncEngine(pipeline)
                    engine.sync(instance)
                    logger.info(
                        "Auto-ingested %s after connect",
                        connector_id,
                    )
                    _invalidate_chunk_cache(
                        connector_id,
                        owner_user_id=owner_user_id,
                        account_key=account_key,
                    )
                except Exception as exc:
                    logger.warning(
                        "Auto-ingest failed for %s: %s",
                        connector_id,
                        exc,
                    )

            if account is not None:
                try:
                    request.app.state.connector_account_store.update_account(
                        str(account["id"]),
                        owner_user_id=owner_user_id,
                        status="connected",
                    )
                except Exception:
                    logger.debug("Connector account status update skipped", exc_info=True)
            threading.Thread(target=_ingest, daemon=True).start()

        return {
            "connector_id": connector_id,
            "connected": instance.is_connected(),
            "status": "connected" if instance.is_connected() else "pending",
        }

    @router.post("/{connector_id}/disconnect")
    async def disconnect_connector(
        connector_id: str,
        request: FastAPIRequest,
        account_id: Optional[str] = None,
    ):
        """Disconnect a connector and clear its credentials."""
        account = _resolve_account(request, account_id)
        if account is None:
            require_role_if_bootstrapped(request, "superadmin")
        _ensure_connectors_registered()
        if not ConnectorRegistry.contains(connector_id):
            raise HTTPException(
                status_code=404,
                detail=f"Connector '{connector_id}' not found",
            )
        owner_user_id = str(account["owner_user_id"]) if account is not None else ""
        account_key = str(account["id"]) if account is not None else ""
        instance = _get_or_create(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )
        try:
            instance.disconnect()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))
        _sync_state.pop(connector_id, None)
        _sync_threads.pop(connector_id, None)
        _invalidate_connector_cache(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )
        if account is not None:
            try:
                request.app.state.connector_account_store.update_account(
                    str(account["id"]),
                    owner_user_id=owner_user_id,
                    status="configured",
                )
            except Exception:
                logger.debug("Connector account status reset skipped", exc_info=True)
        return {
            "connector_id": connector_id,
            "connected": False,
            "status": "disconnected",
        }

    @router.get("/{connector_id}/oauth/start")
    async def oauth_start(connector_id: str, request: FastAPIRequest):
        """Redirect to the OAuth provider's consent page.

        The callback will come back to /v1/connectors/{id}/oauth/callback.
        """
        require_role_if_bootstrapped(request, "superadmin")
        from urllib.parse import urlencode

        from openjarvis.connectors.oauth import (
            get_client_credentials,
            get_provider_for_connector,
        )

        _ensure_connectors_registered()
        if not ConnectorRegistry.contains(connector_id):
            raise HTTPException(404, f"Connector '{connector_id}' not found")

        provider = get_provider_for_connector(connector_id)
        if not provider:
            raise HTTPException(400, f"No OAuth provider for '{connector_id}'")

        creds = get_client_credentials(provider)
        if not creds:
            raise HTTPException(
                400,
                f"No client credentials configured for {provider.display_name}. "
                f"Set up at: {provider.setup_url}",
            )

        client_id, _ = creds
        # Build callback URL pointing to our own server
        base_url = str(request.base_url).rstrip("/")
        callback_url = f"{base_url}/v1/connectors/{connector_id}/oauth/callback"

        params = {
            "client_id": client_id,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": " ".join(provider.scopes),
            **provider.extra_auth_params,
        }
        auth_url = f"{provider.auth_endpoint}?{urlencode(params)}"

        from fastapi.responses import RedirectResponse

        return RedirectResponse(url=auth_url)

    @router.get("/providers/{provider_name}/oauth/start")
    async def provider_oauth_start(
        provider_name: str,
        request: FastAPIRequest,
        account_id: Optional[str] = None,
    ):
        """Redirect to a provider-first OAuth consent page.

        Root cause: Google-style provider auth already spans multiple
        connectors, but the previous API only exposed connector-specific
        OAuth starts. A provider route lets the UI offer "Connect Google"
        without pretending the user should pick one connector first.
        """
        from urllib.parse import urlencode

        from openjarvis.connectors.oauth import OAUTH_PROVIDERS, get_client_credentials

        account = _resolve_account(request, account_id)
        if account is None:
            require_role_if_bootstrapped(request, "superadmin")

        provider = OAUTH_PROVIDERS.get(provider_name)
        if provider is None:
            raise HTTPException(404, f"OAuth provider '{provider_name}' not found")

        creds = get_client_credentials(provider)
        if not creds:
            raise HTTPException(
                400,
                f"No client credentials configured for {provider.display_name}. "
                f"Set up at: {provider.setup_url}",
            )

        client_id, _ = creds
        base_url = str(request.base_url).rstrip("/")
        callback_url = f"{base_url}/v1/connectors/providers/{provider_name}/oauth/callback"
        state = _encode_oauth_state(account_id=str(account["id"]) if account is not None else "")
        params = {
            "client_id": client_id,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": " ".join(provider.scopes),
            "state": state,
            **provider.extra_auth_params,
        }
        auth_url = f"{provider.auth_endpoint}?{urlencode(params)}"

        from fastapi.responses import RedirectResponse

        return RedirectResponse(url=auth_url)

    @router.get("/{connector_id}/oauth/callback")
    async def oauth_callback(
        connector_id: str,
        code: str = "",
        error: str = "",
        request: FastAPIRequest = None,
    ):
        """Handle OAuth callback from the provider."""
        if request is not None:
            require_role_if_bootstrapped(request, "superadmin")
        from fastapi.responses import HTMLResponse

        from openjarvis.connectors.oauth import (
            _CONNECTORS_DIR,
            _exchange_token,
            get_client_credentials,
            get_provider_for_connector,
            save_tokens,
        )

        _ensure_connectors_registered()

        if error:
            _style = "font-family:system-ui;text-align:center;padding:60px"
            return HTMLResponse(
                content=(
                    f"<html><body style='{_style}'>"
                    f"<h2 style='color:#ef4444'>Authorization Failed</h2>"
                    f"<p>{error}</p>"
                    "<script>setTimeout(()=>window.close(),3000)</script>"
                    "</body></html>"
                ),
                status_code=400,
            )

        if not code:
            raise HTTPException(400, "Missing authorization code")

        provider = get_provider_for_connector(connector_id)
        if not provider:
            raise HTTPException(400, f"No OAuth provider for '{connector_id}'")

        creds = get_client_credentials(provider)
        if not creds:
            raise HTTPException(400, "No client credentials configured")

        client_id, client_secret = creds
        base_url = str(request.base_url).rstrip("/")
        redirect_uri = f"{base_url}/v1/connectors/{connector_id}/oauth/callback"

        try:
            tokens = _exchange_token(
                provider, code, client_id, client_secret, redirect_uri
            )
        except Exception as exc:
            _style = "font-family:system-ui;text-align:center;padding:60px"
            return HTMLResponse(
                content=(
                    f"<html><body style='{_style}'>"
                    f"<h2 style='color:#ef4444'>Token Exchange Failed</h2>"
                    f"<p>{exc}</p>"
                    "</body></html>"
                ),
                status_code=500,
            )

        payload = {
            "access_token": tokens.get("access_token", ""),
            "refresh_token": tokens.get("refresh_token", ""),
            "token_type": tokens.get("token_type", "Bearer"),
            "expires_in": tokens.get("expires_in", 3600),
            "client_id": client_id,
            "client_secret": client_secret,
        }

        for filename in provider.credential_files:
            save_tokens(str(_CONNECTORS_DIR / filename), payload)

        # Clear cached instance so it picks up new credentials
        _invalidate_connector_cache(connector_id)

        _style = "font-family:system-ui;text-align:center;padding:60px"
        return HTMLResponse(
            content=(
                f"<html><body style='{_style}'>"
                "<h2 style='color:#22c55e'>Connected!</h2>"
                "<p>You can close this tab and return to OpenJarvis.</p>"
                "<script>setTimeout(()=>window.close(),2000)</script>"
                "</body></html>"
            )
        )

    @router.get("/providers/{provider_name}/oauth/callback")
    async def provider_oauth_callback(
        provider_name: str,
        code: str = "",
        error: str = "",
        state: str = "",
        request: FastAPIRequest = None,
    ):
        """Handle provider-first OAuth callbacks and persist tokens.

        Root cause: once the UI connects by provider, the callback must save
        credentials across the provider's covered connectors instead of only
        one connector-specific file.
        """
        from fastapi.responses import HTMLResponse

        from openjarvis.connectors.oauth import (
            OAUTH_PROVIDERS,
            _CONNECTORS_DIR,
            _exchange_token,
            get_client_credentials,
            save_tokens,
        )

        provider = OAUTH_PROVIDERS.get(provider_name)
        if provider is None:
            raise HTTPException(404, f"OAuth provider '{provider_name}' not found")

        if error:
            _style = "font-family:system-ui;text-align:center;padding:60px"
            return HTMLResponse(
                content=(
                    f"<html><body style='{_style}'>"
                    f"<h2 style='color:#ef4444'>Authorization Failed</h2>"
                    f"<p>{error}</p>"
                    "<script>setTimeout(()=>window.close(),3000)</script>"
                    "</body></html>"
                ),
                status_code=400,
            )

        if not code:
            raise HTTPException(400, "Missing authorization code")

        state_data = _decode_oauth_state(state)
        account_id = state_data.get("account_id", "")
        account = _resolve_account(request, account_id or None) if request is not None and account_id else None
        if request is not None and account is None:
            require_role_if_bootstrapped(request, "superadmin")

        creds = get_client_credentials(provider)
        if not creds:
            raise HTTPException(400, "No client credentials configured")

        client_id, client_secret = creds
        base_url = str(request.base_url).rstrip("/")
        redirect_uri = f"{base_url}/v1/connectors/providers/{provider_name}/oauth/callback"

        try:
            tokens = _exchange_token(
                provider, code, client_id, client_secret, redirect_uri
            )
        except Exception as exc:
            _style = "font-family:system-ui;text-align:center;padding:60px"
            return HTMLResponse(
                content=(
                    f"<html><body style='{_style}'>"
                    f"<h2 style='color:#ef4444'>Token Exchange Failed</h2>"
                    f"<p>{exc}</p>"
                    "</body></html>"
                ),
                status_code=500,
            )

        payload = {
            "access_token": tokens.get("access_token", ""),
            "refresh_token": tokens.get("refresh_token", ""),
            "token_type": tokens.get("token_type", "Bearer"),
            "expires_in": tokens.get("expires_in", 3600),
            "client_id": client_id,
            "client_secret": client_secret,
        }

        owner_user_id = str(account["owner_user_id"]) if account is not None else ""
        account_key = str(account["id"]) if account is not None else ""

        if account is not None:
            for connector_id in provider.connector_ids:
                save_tokens(
                    _account_credentials_path(owner_user_id, account_key, connector_id),
                    payload,
                )
                _invalidate_connector_cache(
                    connector_id,
                    owner_user_id=owner_user_id,
                    account_key=account_key,
                )
            try:
                request.app.state.connector_account_store.update_account(
                    account_key,
                    owner_user_id=owner_user_id,
                    status="connected",
                    metadata={
                        **(account.get("metadata") or {}),
                        "oauth_provider": provider.name,
                    },
                )
            except Exception:
                logger.debug("Provider account status update skipped", exc_info=True)
        else:
            for filename in provider.credential_files:
                save_tokens(str(_CONNECTORS_DIR / filename), payload)
            for connector_id in provider.connector_ids:
                _invalidate_connector_cache(connector_id)

        _style = "font-family:system-ui;text-align:center;padding:60px"
        return HTMLResponse(
            content=(
                f"<html><body style='{_style}'>"
                f"<h2 style='color:#22c55e'>{provider.display_name} connected!</h2>"
                "<p>You can close this tab and return to OpenJarvis.</p>"
                "<script>setTimeout(()=>window.close(),2000)</script>"
                "</body></html>"
            )
        )

    # Track background sync state per connector
    _sync_threads: Dict[str, Any] = {}
    _sync_state: Dict[str, Dict[str, Any]] = {}  # {connector_id: {state, error}}

    @router.post("/{connector_id}/sync")
    def trigger_sync(
        connector_id: str,
        request: FastAPIRequest,
        account_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Trigger a sync in the background and return immediately."""
        account = _resolve_account(request, account_id)
        if account is None:
            require_role_if_bootstrapped(request, "superadmin")
        import threading

        _ensure_connectors_registered()
        if not ConnectorRegistry.contains(connector_id):
            raise HTTPException(
                status_code=404,
                detail=f"Connector '{connector_id}' not found",
            )
        owner_user_id = str(account["owner_user_id"]) if account is not None else ""
        account_key = str(account["id"]) if account is not None else ""
        inst = _get_or_create(
            connector_id,
            owner_user_id=owner_user_id,
            account_key=account_key,
        )
        if not inst.is_connected():
            raise HTTPException(
                status_code=400,
                detail=f"Connector '{connector_id}' is not connected",
            )

        # If already syncing, don't start another
        existing = _sync_threads.get(connector_id)
        if existing and existing.is_alive():
            return {
                "connector_id": connector_id,
                "status": "already_syncing",
            }

        # Mark as syncing immediately so the UI picks it up
        _sync_state[connector_id] = {"state": "syncing", "error": None}

        def _run_sync() -> None:
            try:
                from openjarvis.connectors.pipeline import IngestionPipeline
                from openjarvis.connectors.store import KnowledgeStore
                from openjarvis.connectors.sync_engine import SyncEngine

                store = KnowledgeStore()
                pipeline = IngestionPipeline(
                    store=store,
                    owner_user_id=owner_user_id,
                    account_key=account_key,
                )
                engine = SyncEngine(pipeline=pipeline)
                engine.sync(inst)
                logger.info("Sync completed for %s", connector_id)
                _sync_state[connector_id] = {"state": "complete", "error": None}
                _invalidate_chunk_cache(
                    connector_id,
                    owner_user_id=owner_user_id,
                    account_key=account_key,
                )
            except Exception as exc:
                error_msg = str(exc)
                if "401" in error_msg or "Unauthorized" in error_msg:
                    error_msg = "Authentication failed — credentials may have expired."
                elif "403" in error_msg or "Forbidden" in error_msg:
                    error_msg = "Permission denied — check API scopes."
                elif "429" in error_msg or "Too Many Requests" in error_msg:
                    error_msg = "Rate limited — wait a minute and try again."
                elif "timeout" in error_msg.lower():
                    error_msg = "Connection timed out."
                logger.error("Sync failed for %s: %s", connector_id, error_msg)
                _sync_state[connector_id] = {"state": "error", "error": error_msg}

        t = threading.Thread(target=_run_sync, daemon=True)
        t.start()
        _sync_threads[connector_id] = t
        t.join(timeout=0.25)

        if not t.is_alive():
            bg = _sync_state.get(connector_id, {})
            return {
                "connector_id": connector_id,
                "status": "complete" if bg.get("state") == "complete" else bg.get("state", "started"),
                "chunks_indexed": _chunk_count(
                    connector_id,
                    owner_user_id=owner_user_id,
                    account_key=account_key,
                ),
                "error": bg.get("error"),
            }

        return {
            "connector_id": connector_id,
            "status": "started",
            "chunks_indexed": _chunk_count(
                connector_id,
                owner_user_id=owner_user_id,
                account_key=account_key,
            ),
        }

    @router.get("/{connector_id}/sync")
    async def sync_status(
        connector_id: str,
        request: FastAPIRequest,
        account_id: Optional[str] = None,
    ):
        """Return the current sync status for a connector."""
        account = _resolve_account(request, account_id)
        if account is None:
            require_role_if_bootstrapped(request, "superadmin")
        _ensure_connectors_registered()
        owner_user_id = str(account["owner_user_id"]) if account is not None else ""
        account_key = str(account["id"]) if account is not None else ""
        try:
            instance = _get_or_create(
                connector_id,
                owner_user_id=owner_user_id,
                account_key=account_key,
            )
        except Exception:
            raise HTTPException(
                status_code=404,
                detail=f"Connector '{connector_id}' not found",
            )
        try:
            status = instance.sync_status()
        except Exception as exc:
            logger.warning(
                "Connector sync status probe failed for %s: %s",
                connector_id,
                exc,
            )
            status = type(
                "ConnectorSyncStatusFallback",
                (),
                {
                    "state": "idle",
                    "items_synced": 0,
                    "items_total": 0,
                    "last_sync": None,
                    "error": str(exc),
                },
            )()

        # Override with router-level sync state (background thread tracking)
        bg = _sync_state.get(connector_id, {})
        bg_thread = _sync_threads.get(connector_id)
        is_bg_running = bg_thread is not None and bg_thread.is_alive()

        # Determine effective state
        if is_bg_running:
            effective_state = "syncing"
        elif bg.get("state") == "error":
            effective_state = "error"
        elif status.state != "idle":
            effective_state = status.state
        else:
            effective_state = status.state

        # Use the bg error if the connector doesn't have one
        effective_error = status.error or bg.get("error")

        return {
            "connector_id": connector_id,
            "state": effective_state,
            "items_synced": status.items_synced,
            "items_total": status.items_total,
            "last_sync": (status.last_sync.isoformat() if status.last_sync else None),
            "error": effective_error,
        }

    return router


__all__ = ["ConnectRequest", "create_connectors_router"]
