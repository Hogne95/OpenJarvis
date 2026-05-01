"""Action Center staging, approval, and source summary routes."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from openjarvis.server.auth import (
    get_action_center_manager,
    require_current_user_if_bootstrapped,
    require_role_if_bootstrapped,
)


class ActionEmailDraftRequest(BaseModel):
    recipient: str
    subject: str
    body: str
    provider: str = "gmail"
    account_key: Optional[str] = None


class ActionCalendarBriefRequest(BaseModel):
    title: str
    start_at: str
    end_at: Optional[str] = None
    attendees: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    provider: Optional[str] = None
    account_key: Optional[str] = None


class InboxActionStageRequest(BaseModel):
    action_kind: Literal["archive", "star"]
    source: str
    message_id: str
    title: str
    author: str
    account_key: Optional[str] = None


class ActionTaskCreateRequest(BaseModel):
    title: str
    notes: Optional[str] = None
    due_at: Optional[str] = None
    provider: Optional[str] = None
    account_key: Optional[str] = None


action_center_router = APIRouter(prefix="/v1/action-center", tags=["action-center"])


def _knowledge_owner_user_id(request: Request) -> str:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        return ""
    return str(user.get("id") or "").strip()


@action_center_router.get("/status")
async def action_center_status(request: Request):
    manager = get_action_center_manager(request)
    user = require_role_if_bootstrapped(request)
    include_capabilities = bool(
        user is None or str(user.get("role", "")).strip().lower() == "superadmin"
    )
    return manager.status(include_capabilities=include_capabilities)


@action_center_router.get("/capabilities")
async def action_center_capabilities(request: Request):
    require_role_if_bootstrapped(request, "superadmin")
    manager = get_action_center_manager(request)
    return manager.capabilities()


@action_center_router.post("/stage-email")
async def action_center_stage_email(req: ActionEmailDraftRequest, request: Request):
    manager = get_action_center_manager(request)
    try:
        return manager.stage_email_draft(
            recipient=req.recipient,
            subject=req.subject,
            body=req.body,
            provider=req.provider,
            account_key=req.account_key or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/stage-calendar")
async def action_center_stage_calendar(req: ActionCalendarBriefRequest, request: Request):
    manager = get_action_center_manager(request)
    try:
        return manager.stage_calendar_brief(
            title=req.title,
            start_at=req.start_at,
            end_at=req.end_at or "",
            attendees=req.attendees or "",
            location=req.location or "",
            notes=req.notes or "",
            provider=req.provider or "",
            account_key=req.account_key or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/stage-inbox-action")
async def action_center_stage_inbox_action(req: InboxActionStageRequest, request: Request):
    manager = get_action_center_manager(request)
    try:
        return manager.stage_inbox_action(
            action_kind=req.action_kind,
            source=req.source,
            message_id=req.message_id,
            title=req.title,
            author=req.author,
            account_key=req.account_key or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/stage-task")
async def action_center_stage_task(req: ActionTaskCreateRequest, request: Request):
    manager = get_action_center_manager(request)
    try:
        return manager.stage_task(
            title=req.title,
            notes=req.notes or "",
            due_at=req.due_at or "",
            provider=req.provider or "",
            account_key=req.account_key or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/approve")
async def action_center_approve(request: Request):
    require_role_if_bootstrapped(request, "superadmin")
    manager = get_action_center_manager(request)
    try:
        return await run_in_threadpool(manager.approve)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/hold")
async def action_center_hold(request: Request):
    manager = get_action_center_manager(request)
    return manager.hold()


@action_center_router.get("/inbox-summary")
async def action_center_inbox_summary(request: Request, limit: int = 5):
    owner_user_id = _knowledge_owner_user_id(request)
    try:
        from openjarvis.connectors.store import KnowledgeStore

        store = KnowledgeStore()
        query = """
            SELECT doc_id, thread_id, title, author, timestamp, content, source, account_key
            FROM knowledge_chunks
            WHERE doc_type = 'email' AND source IN ('gmail', 'gmail_imap', 'outlook')
        """
        params: list[Any] = []
        if owner_user_id:
            query += " AND owner_user_id = ?"
            params.append(owner_user_id)
        query += """
            ORDER BY timestamp DESC, created_at DESC
            LIMIT ?
        """
        params.append(max(1, min(limit, 10)))
        rows = store._conn.execute(query, tuple(params)).fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    items = []
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        key = (row["title"] or "", row["author"] or "", row["timestamp"] or "")
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "doc_id": row["doc_id"] or "",
                "thread_id": row["thread_id"] or "",
                "title": row["title"] or "(No subject)",
                "author": row["author"] or "Unknown sender",
                "author_email": parseaddr(row["author"] or "")[1],
                "timestamp": row["timestamp"] or "",
                "snippet": (row["content"] or "").strip()[:220],
                "source": row["source"] or "",
                "account_key": row["account_key"] or "",
                "supports_mutation": (row["source"] or "") == "gmail" and str(row["doc_id"] or "").startswith("gmail:"),
            }
        )
    return {"items": items}


@action_center_router.get("/task-summary")
async def action_center_task_summary(request: Request, limit: int = 6):
    owner_user_id = _knowledge_owner_user_id(request)
    try:
        from openjarvis.connectors.store import KnowledgeStore

        store = KnowledgeStore()
        query = """
            SELECT title, timestamp, content, metadata, source
            FROM knowledge_chunks
            WHERE doc_type = 'task' AND source = 'google_tasks'
        """
        params: list[Any] = []
        if owner_user_id:
            query += " AND owner_user_id = ?"
            params.append(owner_user_id)
        query += """
            ORDER BY timestamp DESC, created_at DESC
            LIMIT ?
        """
        params.append(max(1, min(limit, 12)))
        rows = store._conn.execute(query, tuple(params)).fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    items = []
    for row in rows:
        try:
            metadata = json.loads(row["metadata"] or "{}")
        except Exception:
            metadata = {}
        items.append(
            {
                "title": row["title"] or "Untitled Task",
                "timestamp": row["timestamp"] or "",
                "notes": (row["content"] or "").strip()[:180],
                "status": metadata.get("status", ""),
                "due": metadata.get("due", ""),
                "source": row["source"] or "",
            }
        )
    return {"items": items}


@action_center_router.get("/reminders")
async def action_center_reminders(request: Request, limit: int = 8):
    owner_user_id = _knowledge_owner_user_id(request)
    try:
        from openjarvis.connectors.store import KnowledgeStore

        store = KnowledgeStore()
        now = datetime.now(timezone.utc)
        upcoming_cutoff = (now + timedelta(hours=24)).isoformat()
        now_iso = now.isoformat()

        event_query = """
            SELECT title, timestamp, content, source
            FROM knowledge_chunks
            WHERE doc_type = 'event'
              AND source = 'gcalendar'
              AND timestamp >= ?
              AND timestamp <= ?
        """
        event_params: list[Any] = [now_iso, upcoming_cutoff]
        if owner_user_id:
            event_query += " AND owner_user_id = ?"
            event_params.append(owner_user_id)
        event_query += """
            ORDER BY timestamp ASC
            LIMIT ?
        """
        event_params.append(max(1, min(limit, 8)))
        event_rows = store._conn.execute(event_query, tuple(event_params)).fetchall()

        task_query = """
            SELECT title, metadata, timestamp, source
            FROM knowledge_chunks
            WHERE doc_type = 'task'
              AND source = 'google_tasks'
        """
        task_params: list[Any] = []
        if owner_user_id:
            task_query += " AND owner_user_id = ?"
            task_params.append(owner_user_id)
        task_query += """
            ORDER BY created_at DESC
            LIMIT 30
        """
        task_rows = store._conn.execute(task_query, tuple(task_params)).fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    items = []
    for row in event_rows:
        items.append(
            {
                "kind": "event",
                "title": row["title"] or "(No title)",
                "when": row["timestamp"] or "",
                "detail": ((row["content"] or "").splitlines()[1:2] or [""])[0],
                "source": row["source"] or "",
            }
        )

    for row in task_rows:
        try:
            metadata = json.loads(row["metadata"] or "{}")
        except Exception:
            metadata = {}
        status = metadata.get("status", "")
        due = metadata.get("due", "")
        if status == "completed" or not due:
            continue
        items.append(
            {
                "kind": "task",
                "title": row["title"] or "Untitled Task",
                "when": due,
                "detail": f"Status: {status or 'needsAction'}",
                "source": row["source"] or "",
            }
        )

    items.sort(key=lambda item: item.get("when", ""))
    return {"items": items[: max(1, min(limit, 10))]}
