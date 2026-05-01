"""Managed agent architecture routes."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openjarvis.server.agent_architecture import (
    build_architecture_status,
    create_role_handoff,
    ensure_core_team,
)
from openjarvis.server.auth import require_current_user_if_bootstrapped


class AgentArchitectureHandoffRequest(BaseModel):
    brief: str
    source: Optional[str] = "hud"
    metadata: Optional[Dict[str, Any]] = None


agent_architecture_router = APIRouter(prefix="/v1/agent-architecture", tags=["agent-architecture"])


def _owner_user_id(request: Request) -> str | None:
    current_user = require_current_user_if_bootstrapped(request)
    return str(current_user.get("id") or "").strip() if current_user else None


@agent_architecture_router.get("/status")
async def agent_architecture_status(request: Request):
    return build_architecture_status(request.app.state, owner_user_id=_owner_user_id(request))


@agent_architecture_router.post("/ensure-core")
async def agent_architecture_ensure_core(request: Request):
    try:
        return ensure_core_team(request.app.state, owner_user_id=_owner_user_id(request))
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@agent_architecture_router.post("/handoff")
async def agent_architecture_handoff(req: AgentArchitectureHandoffRequest, request: Request):
    try:
        return create_role_handoff(
            request.app.state,
            brief=req.brief,
            source=req.source or "hud",
            metadata=req.metadata or {},
            owner_user_id=_owner_user_id(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
