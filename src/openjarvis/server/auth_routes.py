"""Authentication routes for the JARVIS web UI."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from openjarvis.server.auth import (
    SESSION_COOKIE_NAME,
    get_current_user,
)


class BootstrapRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


def create_auth_router() -> APIRouter:
    router = APIRouter(prefix="/v1/auth", tags=["auth"])

    def _set_session_cookie(response: Response, token: str) -> None:
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            httponly=True,
            samesite="lax",
            secure=False,
            max_age=60 * 60 * 24 * 30,
            path="/",
        )

    @router.get("/status")
    async def auth_status(request: Request):
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        user = get_current_user(request)
        return {
            "bootstrap_required": store.user_count() == 0,
            "authenticated": user is not None,
            "user": user,
        }

    @router.post("/bootstrap")
    async def bootstrap_auth(req: BootstrapRequest, request: Request, response: Response):
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        try:
            user = store.bootstrap_admin(
                username=req.username,
                password=req.password,
                display_name=req.display_name,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        token = store.create_session(user["id"])
        _set_session_cookie(response, token)
        return {"user": user}

    @router.post("/login")
    async def login_auth(req: LoginRequest, request: Request, response: Response):
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        user = store.authenticate(req.username, req.password)
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        token = store.create_session(user["id"])
        _set_session_cookie(response, token)
        return {"user": user}

    @router.post("/logout")
    async def logout_auth(request: Request, response: Response):
        store = getattr(request.app.state, "user_store", None)
        if store is not None:
            token = request.cookies.get(SESSION_COOKIE_NAME, "")
            store.revoke_session(token)
        response.delete_cookie(SESSION_COOKIE_NAME, path="/")
        return {"ok": True}

    @router.get("/me")
    async def auth_me(request: Request):
        user = get_current_user(request)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        return {"user": user}

    return router


__all__ = ["create_auth_router"]
