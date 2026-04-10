"""Authentication routes for the JARVIS web UI."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from openjarvis.server.auth import (
    SESSION_COOKIE_NAME,
    get_current_user,
    require_role_if_bootstrapped,
)


class BootstrapRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


class AdminCreateUserRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""
    role: str = "user"


class AdminUpdateUserRequest(BaseModel):
    display_name: str | None = None
    role: str | None = None
    status: str | None = None


class AdminResetPasswordRequest(BaseModel):
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

    @router.get("/users")
    async def list_users(request: Request):
        require_role_if_bootstrapped(request, "superadmin", "admin")
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        return {"users": store.list_users()}

    @router.post("/users")
    async def create_user_admin(req: AdminCreateUserRequest, request: Request):
        actor = require_role_if_bootstrapped(request, "superadmin", "admin")
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        requested_role = req.role.strip().lower() or "user"
        actor_role = str(actor["role"]).lower() if actor is not None else ""
        if actor_role != "superadmin" and requested_role in {"superadmin", "admin"}:
            raise HTTPException(status_code=403, detail="Only a superadmin can create admin users")
        try:
            user = store.create_user(
                username=req.username,
                password=req.password,
                display_name=req.display_name,
                role=requested_role,
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Username already exists") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"user": user}

    @router.patch("/users/{user_id}")
    async def update_user_admin(user_id: str, req: AdminUpdateUserRequest, request: Request):
        actor = require_role_if_bootstrapped(request, "superadmin", "admin")
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        target = store.get_user_by_id(user_id)
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        actor_role = str(actor["role"]).lower() if actor is not None else ""
        target_role = str(target["role"]).lower()
        next_role = req.role.strip().lower() if req.role is not None else target_role
        if actor_role != "superadmin" and (
            target_role in {"superadmin", "admin"} or next_role in {"superadmin", "admin"}
        ):
            raise HTTPException(status_code=403, detail="Only a superadmin can manage admin users")
        try:
            user = store.update_user(
                user_id,
                display_name=req.display_name,
                role=req.role,
                status=req.status,
            )
        except ValueError as exc:
            detail = str(exc)
            code = 404 if "not found" in detail.lower() else 400
            raise HTTPException(status_code=code, detail=detail) from exc
        return {"user": user}

    @router.post("/users/{user_id}/reset-password")
    async def reset_user_password(user_id: str, req: AdminResetPasswordRequest, request: Request):
        actor = require_role_if_bootstrapped(request, "superadmin", "admin")
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        target = store.get_user_by_id(user_id)
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        actor_role = str(actor["role"]).lower() if actor is not None else ""
        target_role = str(target["role"]).lower()
        if actor_role != "superadmin" and target_role in {"superadmin", "admin"}:
            raise HTTPException(status_code=403, detail="Only a superadmin can reset admin passwords")
        try:
            user = store.set_password(user_id, req.password)
        except ValueError as exc:
            detail = str(exc)
            code = 404 if "not found" in detail.lower() else 400
            raise HTTPException(status_code=code, detail=detail) from exc
        return {"user": user}

    return router


__all__ = ["create_auth_router"]
