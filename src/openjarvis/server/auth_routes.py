"""Authentication routes for the JARVIS web UI."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from openjarvis.server.auth_mail import send_password_reset_email
from openjarvis.server.auth import (
    SESSION_COOKIE_NAME,
    get_current_user,
    require_role_if_bootstrapped,
)
from openjarvis.server.web_security import resolve_cookie_settings


class BootstrapRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""
    email: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


class AdminCreateUserRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""
    email: str = ""
    role: str = "user"


class AdminUpdateUserRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None
    role: str | None = None
    status: str | None = None


class AdminResetPasswordRequest(BaseModel):
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


def create_auth_router() -> APIRouter:
    router = APIRouter(prefix="/v1/auth", tags=["auth"])

    def _set_session_cookie(request: Request, response: Response, token: str) -> None:
        settings = resolve_cookie_settings(request)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            httponly=True,
            samesite=settings.same_site,
            secure=settings.secure,
            domain=settings.domain,
            max_age=settings.max_age,
            path="/",
        )

    def _auth_limit_key(request: Request, req_username: str = "") -> str:
        forwarded_for = (request.headers.get("x-forwarded-for", "") or "").split(",")[0].strip()
        client_host = forwarded_for or (request.client.host if request.client else "unknown")
        username = req_username.strip().lower()
        return f"{request.url.path}:{client_host}:{username}"

    def _request_origin(request: Request) -> str:
        public_origin = (request.headers.get("origin", "") or "").strip()
        if public_origin:
            return public_origin.rstrip("/")
        referer = (request.headers.get("referer", "") or "").strip()
        if referer:
            head = referer.split("/reset-password", 1)[0].split("/login", 1)[0]
            return head.rstrip("/")
        return str(request.base_url).rstrip("/")

    def _check_auth_rate_limit(request: Request, req_username: str = "") -> str:
        limiter = getattr(request.app.state, "auth_rate_limiter", None)
        if limiter is None:
            return ""
        key = _auth_limit_key(request, req_username)
        allowed, retry_after = limiter.check(key)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many authentication attempts. Please wait and try again.",
                headers={"Retry-After": str(retry_after)},
            )
        return key

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
        limit_key = _check_auth_rate_limit(request, req.username)
        try:
            user = store.bootstrap_admin(
                username=req.username,
                password=req.password,
                display_name=req.display_name,
            )
            if req.email.strip():
                user = store.update_user(user["id"], email=req.email)
        except ValueError as exc:
            limiter = getattr(request.app.state, "auth_rate_limiter", None)
            if limiter is not None:
                limiter.record_failure(limit_key)
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        token = store.create_session(user["id"])
        limiter = getattr(request.app.state, "auth_rate_limiter", None)
        if limiter is not None:
            limiter.reset(limit_key)
        _set_session_cookie(request, response, token)
        return {"user": user}

    @router.post("/login")
    async def login_auth(req: LoginRequest, request: Request, response: Response):
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        limit_key = _check_auth_rate_limit(request, req.username)
        user = store.authenticate(req.username, req.password)
        if user is None:
            limiter = getattr(request.app.state, "auth_rate_limiter", None)
            if limiter is not None:
                limiter.record_failure(limit_key)
            raise HTTPException(status_code=401, detail="Invalid username or password")
        token = store.create_session(user["id"])
        limiter = getattr(request.app.state, "auth_rate_limiter", None)
        if limiter is not None:
            limiter.reset(limit_key)
        _set_session_cookie(request, response, token)
        return {"user": user}

    @router.post("/logout")
    async def logout_auth(request: Request, response: Response):
        store = getattr(request.app.state, "user_store", None)
        if store is not None:
            token = request.cookies.get(SESSION_COOKIE_NAME, "")
            store.revoke_session(token)
        settings = resolve_cookie_settings(request)
        response.delete_cookie(
            SESSION_COOKIE_NAME,
            path="/",
            domain=settings.domain,
            secure=settings.secure,
            samesite=settings.same_site,
        )
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
                email=req.email,
                role=requested_role,
            )
        except sqlite3.IntegrityError as exc:
            detail = "Recovery email already exists" if "email" in str(exc).lower() else "Username already exists"
            raise HTTPException(status_code=409, detail=detail) from exc
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
                email=req.email,
                role=req.role,
                status=req.status,
            )
        except sqlite3.IntegrityError as exc:
            detail = "Recovery email already exists" if "email" in str(exc).lower() else "User update conflict"
            raise HTTPException(status_code=409, detail=detail) from exc
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

    @router.post("/forgot-password")
    async def forgot_password(req: ForgotPasswordRequest, request: Request):
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        limit_key = _check_auth_rate_limit(request, req.email)
        try:
            user = store.get_user_by_email(req.email)
            if user is not None and user.get("status") == "active":
                token = store.create_password_reset_token(user["id"])
                send_password_reset_email(request.app.state, _request_origin(request), user, token)
        except ValueError:
            pass
        limiter = getattr(request.app.state, "auth_rate_limiter", None)
        if limiter is not None:
            limiter.reset(limit_key)
        return {
            "ok": True,
            "detail": "If that email exists in JARVIS, a password reset link has been sent.",
        }

    @router.post("/reset-password")
    async def reset_password(req: ResetPasswordRequest, request: Request):
        store = getattr(request.app.state, "user_store", None)
        if store is None:
            raise HTTPException(status_code=503, detail="User store is unavailable")
        try:
            user = store.consume_password_reset_token(req.token, req.password)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"user": user}

    return router


__all__ = ["create_auth_router"]
