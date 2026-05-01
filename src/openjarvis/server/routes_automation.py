"""Automation and routine scheduling routes."""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openjarvis.server.auth import get_operator_memory_manager


class RoutineScheduleRequest(BaseModel):
    routine_id: Literal["daily_ops", "inbox_sweep", "meeting_prep"]
    enabled: bool
    cron: Optional[str] = None
    agent: str = "orchestrator"


automation_router = APIRouter(prefix="/v1/automation", tags=["automation"])


def _routine_defaults(routine_id: str, operator_memory: Any | None = None) -> dict[str, str]:
    snapshot = operator_memory.snapshot() if operator_memory is not None else {}
    profile = snapshot.get("profile", {}) if isinstance(snapshot, dict) else {}
    signals = snapshot.get("signals", {}) if isinstance(snapshot, dict) else {}
    relationships = snapshot.get("relationships", {}) if isinstance(snapshot, dict) else {}
    meetings = snapshot.get("meetings", {}) if isinstance(snapshot, dict) else {}

    honorific = str(profile.get("honorific", "sir")).strip() or "sir"
    reply_tone = str(profile.get("reply_tone", "clear and concise")).strip() or "clear and concise"
    priority_contacts = profile.get("priority_contacts", []) or []
    top_contacts = signals.get("top_contacts", []) or []

    contact_context = ", ".join([*priority_contacts[:5], *[c for c in top_contacts if c not in priority_contacts][:5]])
    relationship_notes = "; ".join(
        filter(
            None,
            [
                f"{value.get('name') or key}: {value.get('relationship') or 'known contact'} ({value.get('importance', 'normal')})"
                for key, value in list(relationships.items())[:5]
            ],
        )
    )
    meeting_notes = "; ".join(
        filter(
            None,
            [
                f"{value.get('title') or key}: {value.get('prep_style') or 'default prep'}"
                for key, value in list(meetings.items())[:5]
            ],
        )
    )

    prompts = {
        "daily_ops": (
            f"Generate a daily operations brief for {honorific}. "
            f"Use a {reply_tone} tone. Cover inbox priorities, upcoming meetings, and open tasks. "
            f"Prioritize these contacts when relevant: {contact_context or 'no saved contact priorities yet'}. "
            f"Known relationship context: {relationship_notes or 'none'}. "
            f"Known meeting context: {meeting_notes or 'none'}."
        ),
        "inbox_sweep": (
            f"Review connected inbox sources for {honorific}, highlight urgent threads first, and draft concise reply recommendations "
            f"using a {reply_tone} tone. Prioritize these contacts: {contact_context or 'no saved contact priorities yet'}. "
            f"Known relationship context: {relationship_notes or 'none'}."
        ),
        "meeting_prep": (
            f"Review upcoming calendar events for {honorific} and prepare concise meeting briefs with context, risks, and talking points. "
            f"Use saved prep patterns when possible. Known meeting context: {meeting_notes or 'none'}. "
            f"Important contacts to watch: {contact_context or 'no saved contact priorities yet'}."
        ),
    }
    crons = {
        "daily_ops": "0 8 * * *",
        "inbox_sweep": "0 9 * * *",
        "meeting_prep": "0 * * * *",
    }
    return {"prompt": prompts[routine_id], "cron": crons[routine_id]}


@automation_router.get("/status")
async def automation_status(request: Request):
    scheduler = getattr(request.app.state, "task_scheduler", None)
    if scheduler is None:
        return {"available": False, "items": []}
    items = []
    for task in scheduler.list_tasks():
        if not task.id.startswith("routine:"):
            continue
        items.append(
            {
                "routine_id": task.id.removeprefix("routine:"),
                "status": task.status,
                "next_run": task.next_run,
                "last_run": task.last_run,
                "cron": task.schedule_value,
                "agent": task.agent,
            }
        )
    return {"available": True, "items": items}


@automation_router.get("/logs")
async def automation_logs(request: Request, limit: int = 12):
    scheduler = getattr(request.app.state, "task_scheduler", None)
    scheduler_store = getattr(request.app.state, "task_scheduler_store", None)
    if scheduler is None or scheduler_store is None:
        return {"available": False, "items": []}

    items: list[dict[str, Any]] = []
    for task in scheduler.list_tasks():
        if not task.id.startswith("routine:"):
            continue
        for log in scheduler_store.get_run_logs(task.id, limit=max(1, min(limit, 5))):
            items.append(
                {
                    "routine_id": task.id.removeprefix("routine:"),
                    "task_id": task.id,
                    "started_at": log.get("started_at"),
                    "finished_at": log.get("finished_at"),
                    "success": bool(log.get("success")),
                    "result": log.get("result", ""),
                    "error": log.get("error", ""),
                }
            )
    items.sort(key=lambda item: item.get("started_at") or "", reverse=True)
    return {"available": True, "items": items[: max(1, min(limit, 25))]}


@automation_router.post("/routine")
async def automation_schedule_routine(req: RoutineScheduleRequest, request: Request):
    scheduler = getattr(request.app.state, "task_scheduler", None)
    if scheduler is None:
        raise HTTPException(status_code=503, detail="Task scheduler not available")

    defaults = _routine_defaults(
        req.routine_id,
        get_operator_memory_manager(request),
    )
    task_id = f"routine:{req.routine_id}"
    existing = {task.id: task for task in scheduler.list_tasks()}

    if req.enabled:
        cron = req.cron or defaults["cron"]
        if task_id in existing:
            task_dict = existing[task_id].to_dict()
            task_dict["status"] = "active"
            task_dict["schedule_type"] = "cron"
            task_dict["schedule_value"] = cron
            task_dict["prompt"] = defaults["prompt"]
            task_dict["agent"] = req.agent
            updated_task = existing[task_id].from_dict(task_dict)
            task_dict["next_run"] = scheduler._compute_next_run(updated_task)
            scheduler._store.save_task(task_dict)
        else:
            task = scheduler.create_task(
                prompt=defaults["prompt"],
                schedule_type="cron",
                schedule_value=cron,
                agent=req.agent,
                metadata={"routine_id": req.routine_id},
            )
            task_dict = task.to_dict()
            task_dict["id"] = task_id
            scheduler._store.save_task(task_dict)
    else:
        if task_id in existing:
            scheduler.cancel_task(task_id)

    return await automation_status(request)
