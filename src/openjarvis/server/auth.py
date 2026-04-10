"""Helpers for JARVIS web authentication."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

SESSION_COOKIE_NAME = "openjarvis_session"


def get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    cached = getattr(request.state, "current_user", None)
    if cached is not None:
        return cached
    store = getattr(request.app.state, "user_store", None)
    if store is None:
        request.state.current_user = None
        return None
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    if not token:
        request.state.current_user = None
        return None
    user = store.get_user_for_session(token)
    request.state.current_user = user
    return user


def require_current_user(request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


__all__ = ["SESSION_COOKIE_NAME", "get_current_user", "require_current_user"]
