"""Workbench execution and coding workspace routes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from openjarvis.server.auth import (
    get_coding_workspace_manager,
    get_operator_memory_manager,
    get_workbench_manager,
)


class WorkbenchStageRequest(BaseModel):
    command: str
    working_dir: Optional[str] = None
    timeout: int = 30
    metadata: Optional[dict[str, str | bool]] = None


class CodingReadFileRequest(BaseModel):
    repo_root: str
    file_path: str


class CodingStageEditRequest(BaseModel):
    repo_root: str
    file_path: str
    updated_content: str
    summary: Optional[str] = None
    rationale: Optional[str] = None
    verification_commands: Optional[list[str]] = None


class CodingRecordVerificationRequest(BaseModel):
    command: str
    success: bool
    output: Optional[str] = None


class CodingStageVerificationRequest(BaseModel):
    command: Optional[str] = None
    timeout: int = 60


workbench_router = APIRouter(prefix="/v1/workbench", tags=["workbench"])
coding_router = APIRouter(prefix="/v1/coding", tags=["coding"])


def _record_execution_learning(
    manager: Any,
    *,
    label: str,
    domain: str,
    context_key: str = "",
    outcome_type: str,
    summary: str,
    lesson: str = "",
    reuse_hint: str = "",
    tags: list[str] | None = None,
    confidence: float | None = None,
) -> None:
    if manager is None:
        return
    cleaned_summary = summary.strip()
    cleaned_lesson = lesson.strip()
    if not cleaned_summary and not cleaned_lesson:
        return
    try:
        manager.add_learning_experience(
            label=label.strip() or "Execution lesson",
            domain=domain.strip().lower() or "general",
            context_key=context_key.strip(),
            outcome_type=outcome_type.strip().lower() or "lesson",
            summary=cleaned_summary or cleaned_lesson[:300],
            lesson=cleaned_lesson[:800],
            reuse_hint=reuse_hint.strip()[:400],
            tags=[tag.strip().lower() for tag in (tags or []) if tag and tag.strip()],
            confidence=confidence,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        if (outcome_type.strip().lower() or "lesson") == "mistake":
            _promote_antipattern_learning(
                manager,
                domain=domain,
                context_key=context_key,
                summary=cleaned_summary or f"{label} anti-pattern",
                lesson=cleaned_lesson or cleaned_summary,
                reuse_hint=reuse_hint,
                tags=[tag.strip().lower() for tag in (tags or []) if tag and tag.strip()],
            )
    except Exception:
        return


def _promote_antipattern_learning(
    manager: Any,
    *,
    domain: str,
    context_key: str,
    summary: str,
    lesson: str,
    reuse_hint: str,
    tags: list[str] | None = None,
) -> None:
    if manager is None:
        return
    cleaned_domain = domain.strip().lower()
    if not cleaned_domain:
        return
    related = manager.top_learning_experiences(
        domain=cleaned_domain,
        context_key=context_key.strip(),
        limit=8,
    )
    repeated_mistakes = [
        item for item in related
        if str(item.get("outcome_type", "")).strip().lower() in {"mistake", "anti-pattern"}
    ]
    if len(repeated_mistakes) < 2:
        return
    anti_summary = summary.strip() or lesson.strip()
    anti_lesson = lesson.strip() or anti_summary
    if not anti_summary or not anti_lesson:
        return
    try:
        manager.add_learning_experience(
            label=f"Avoid {cleaned_domain} pattern",
            domain=cleaned_domain,
            context_key=context_key.strip(),
            outcome_type="anti-pattern",
            summary=anti_summary[:300],
            lesson=anti_lesson[:800],
            reuse_hint=(reuse_hint.strip() or "Avoid repeating this pattern in similar contexts.")[:400],
            tags=[*(tags or []), "anti-pattern", "avoid"],
            confidence=0.88,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        return


def _current_self_improve_mission(app_state: Any) -> dict[str, Any] | None:
    operator_memory = getattr(app_state, "operator_memory", None)
    if operator_memory is None:
        return None
    snapshot = operator_memory.snapshot()
    missions = snapshot.get("missions", []) if isinstance(snapshot, dict) else []
    return next(
        (
            item
            for item in missions
            if str(item.get("id", "")).strip().lower() == "mission-self-improve"
            or str(item.get("domain", "")).strip().lower() == "self-improve"
        ),
        None,
    )


def _update_self_improve_mission(
    app_state: Any,
    *,
    phase: str,
    status: str,
    summary: str,
    next_step: str = "",
    result: str = "",
    retry_hint: str = "",
) -> dict[str, Any] | None:
    operator_memory = getattr(app_state, "operator_memory", None)
    if operator_memory is None:
        return None
    current = _current_self_improve_mission(app_state)
    if current is None:
        return None
    mission_id = str(current.get("id", "")).strip() or "mission-self-improve"
    title = str(current.get("title", "")).strip() or "Self-improvement mission"
    return operator_memory.update_mission(
        mission_id,
        {
            "title": title,
            "domain": "self-improve",
            "status": status,
            "phase": phase,
            "summary": summary,
            "next_step": next_step,
            "result": result,
            "retry_hint": retry_hint,
            "result_data": {
                "summary": summary,
                "result": result,
                "phase": phase,
                "status": status,
                "file_path": str(current.get("result_data", {}).get("file_path", "")).strip()
                if isinstance(current.get("result_data"), dict)
                else "",
            },
            "next_action": {
                "kind": "prompt",
                "content": result or next_step or summary,
                "label": "Self-Improve Step",
            },
        },
    )


@workbench_router.get("/status")
async def workbench_status(request: Request):
    manager = get_workbench_manager(request)
    return manager.status()


@workbench_router.post("/stage")
async def workbench_stage(req: WorkbenchStageRequest, request: Request):
    manager = get_workbench_manager(request)
    try:
        return manager.stage(
            command=req.command,
            working_dir=req.working_dir,
            timeout=req.timeout,
            metadata=req.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@workbench_router.post("/approve")
async def workbench_approve(request: Request):
    manager = get_workbench_manager(request)
    try:
        result = await run_in_threadpool(manager.approve)
        latest = result.get("result", {}) if isinstance(result, dict) else {}
        workbench_metadata = latest.get("metadata", {}) if isinstance(latest.get("metadata"), dict) else {}
        operator_memory = get_operator_memory_manager(request)
        command = str(latest.get("command", "")).lower()
        is_validation = any(
            token in command
            for token in (
                "pytest",
                "ruff",
                "npm test",
                "npm run lint",
                "npm run build",
                "cargo test",
                "cargo check",
            )
        )
        if is_validation:
            success = str(latest.get("status", "")).strip().lower() == "success"
            current_self_improve = _current_self_improve_mission(request.app.state) or {}
            current_result_data = current_self_improve.get("result_data", {}) if isinstance(current_self_improve.get("result_data"), dict) else {}
            context_key = str(current_result_data.get("file_path", "")).strip()
            _update_self_improve_mission(
                request.app.state,
                phase="done" if success else "retry",
                status="complete" if success else "blocked",
                summary=(
                    "Self-improvement validation passed."
                    if success
                    else "Self-improvement validation failed."
                ),
                next_step=(
                    "Prepare the commit or continue refining the patch."
                    if success
                    else "Inspect the validation failure and prepare the smallest safe follow-up patch."
                ),
                result=str(latest.get("output", "")).strip()[:500] or str(latest.get("command", "")).strip(),
                retry_hint=(
                    "Start a new self-improvement cycle if more polish is needed."
                    if success
                    else "Retry after narrowing the root cause and patch scope."
                ),
            )
            _record_execution_learning(
                operator_memory,
                label="Validation result",
                domain="self-improve" if context_key else "coding",
                context_key=context_key,
                outcome_type="success" if success else "mistake",
                summary=(
                    f"Validation passed for {context_key or 'the current patch'}."
                    if success
                    else f"Validation failed for {context_key or 'the current patch'}."
                ),
                lesson=(str(latest.get("output", "")).strip() or str(latest.get("command", "")).strip())[:800],
                reuse_hint=(
                    "Reuse the same validation sequence after similar patches."
                    if success
                    else "Reduce the patch scope and rerun the same validation before expanding the fix."
                ),
                tags=["validation", "workbench", "success" if success else "mistake"],
                confidence=0.76 if success else 0.82,
            )
        if workbench_metadata.get("coding_verification"):
            coding_manager = get_coding_workspace_manager(request)
            try:
                coding_status = coding_manager.record_verification(
                    command=str(latest.get("command", "")).strip(),
                    success=str(latest.get("status", "")).strip().lower() == "success",
                    output=str(latest.get("output", "")).strip(),
                )
                pending = coding_status.get("pending")
                if isinstance(pending, dict):
                    operator_memory.note_coding_verification(
                        str(pending.get("repo_root", "")).strip(),
                        command=str(latest.get("command", "")).strip(),
                        success=str(latest.get("status", "")).strip().lower() == "success",
                        output=str(latest.get("output", "")).strip(),
                    )
                if isinstance(result, dict):
                    result["coding"] = coding_status
                    if isinstance(pending, dict):
                        result["repo_memory"] = operator_memory.get_coding_repo(str(pending.get("repo_root", "")).strip())
            except ValueError:
                pass
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@workbench_router.post("/hold")
async def workbench_hold(request: Request):
    manager = get_workbench_manager(request)
    return manager.hold()


@coding_router.get("/status")
async def coding_status(request: Request):
    manager = get_coding_workspace_manager(request)
    payload = manager.status()
    pending = payload.get("pending")
    if isinstance(pending, dict):
        operator_memory = get_operator_memory_manager(request)
        payload["repo_memory"] = operator_memory.get_coding_repo(str(pending.get("repo_root", "")).strip())
    else:
        payload["repo_memory"] = None
    return payload


@coding_router.post("/read-file")
async def coding_read_file(req: CodingReadFileRequest, request: Request):
    manager = get_coding_workspace_manager(request)
    try:
        return manager.read_file(repo_root=req.repo_root, file_path=req.file_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@coding_router.post("/stage-edit")
async def coding_stage_edit(req: CodingStageEditRequest, request: Request):
    manager = get_coding_workspace_manager(request)
    operator_memory = get_operator_memory_manager(request)
    repo_memory = operator_memory.get_coding_repo(req.repo_root) or {}
    try:
        payload = manager.stage_edit(
            repo_root=req.repo_root,
            file_path=req.file_path,
            updated_content=req.updated_content,
            summary=req.summary,
            rationale=req.rationale,
            verification_commands=req.verification_commands,
            preferred_checks=repo_memory.get("preferred_verification_commands", []),
        )
        payload["repo_memory"] = repo_memory or None
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@coding_router.post("/approve")
async def coding_approve(request: Request):
    manager = get_coding_workspace_manager(request)
    try:
        result = manager.approve()
        latest = result.get("result", {}) if isinstance(result, dict) else {}
        file_path = str(latest.get("file_path", "")).strip()
        operator_memory = get_operator_memory_manager(request)
        _update_self_improve_mission(
            request.app.state,
            phase="verify",
            status="active",
            summary=(
                f"Applied a self-improvement patch to {file_path}."
                if file_path
                else "Applied a self-improvement patch."
            ),
            next_step="Run the next validation step to verify the patch.",
            result=str(latest.get("result", "")).strip()[:500] or str(latest.get("diff", "")).strip()[:500],
            retry_hint="If validation fails, reduce the patch to the smallest safe change and retry.",
        )
        _record_execution_learning(
            operator_memory,
            label="Patch applied",
            domain="self-improve" if _current_self_improve_mission(request.app.state) else "coding",
            context_key=file_path,
            outcome_type="success",
            summary=(
                f"Applied a patch to {file_path}."
                if file_path
                else "Applied a coding patch."
            ),
            lesson=(str(latest.get("result", "")).strip() or str(latest.get("diff", "")).strip())[:800],
            reuse_hint="After a successful patch apply, run the narrowest validation that proves the change.",
            tags=["patch", "coding", "success"],
            confidence=0.68,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@coding_router.post("/record-verification")
async def coding_record_verification(req: CodingRecordVerificationRequest, request: Request):
    manager = get_coding_workspace_manager(request)
    operator_memory = get_operator_memory_manager(request)
    try:
        payload = manager.record_verification(
            command=req.command,
            success=req.success,
            output=req.output or "",
        )
        pending = payload.get("pending")
        if isinstance(pending, dict):
            operator_memory.note_coding_verification(
                str(pending.get("repo_root", "")).strip(),
                command=req.command,
                success=req.success,
                output=req.output or "",
            )
            payload["repo_memory"] = operator_memory.get_coding_repo(str(pending.get("repo_root", "")).strip())
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@coding_router.post("/stage-verification")
async def coding_stage_verification(req: CodingStageVerificationRequest, request: Request):
    coding_manager = get_coding_workspace_manager(request)
    workbench_manager = get_workbench_manager(request)
    pending = coding_manager.status().get("pending")
    if not isinstance(pending, dict):
        raise HTTPException(status_code=400, detail="No pending code edit to verify")

    suggested_checks = pending.get("suggested_checks", [])
    selected_command = (req.command or "").strip()
    if not selected_command:
        if not isinstance(suggested_checks, list) or not suggested_checks:
            raise HTTPException(status_code=400, detail="No suggested verification commands available")
        selected_command = str(suggested_checks[0]).strip()
    if not selected_command:
        raise HTTPException(status_code=400, detail="Verification command is required")

    try:
        staged = workbench_manager.stage(
            command=selected_command,
            working_dir=str(pending.get("repo_root", "")).strip() or None,
            timeout=max(10, min(int(req.timeout), 300)),
            metadata={
                "coding_verification": True,
                "file_path": str(pending.get("file_path", "")).strip(),
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "coding": coding_manager.status(),
        "workbench": staged,
    }


@coding_router.post("/hold")
async def coding_hold(request: Request):
    manager = get_coding_workspace_manager(request)
    return manager.hold()
