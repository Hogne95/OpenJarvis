"""Extended API routes for agents, workflows, memory, traces, etc."""

from __future__ import annotations

import inspect
import importlib.util
import json
import logging
import os
import subprocess
import time
from typing import Any, Dict, List, Literal, Optional
from email.utils import parseaddr
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel
from openjarvis.assistant import build_commander_brief
from openjarvis.assistant.commander import build_coding_commander_brief
from openjarvis.connectors.shopify import ShopifyConnector
from openjarvis.server.agent_architecture import (
    build_architecture_status,
    create_role_handoff,
    ensure_core_team,
)
from openjarvis.server.auth import (
    get_action_center_manager,
    get_coding_workspace_manager,
    get_operator_memory_manager,
    get_workbench_manager,
    get_workspace_registry,
    require_current_user_if_bootstrapped,
    require_role_if_bootstrapped,
)

logger = logging.getLogger(__name__)


def _package_ready(module_name: str) -> bool:
    try:
        return importlib.util.find_spec(module_name) is not None
    except Exception:
        return False


def _safe_backend_health(backend: Any) -> tuple[bool, str]:
    """Return backend health without letting probe errors break status routes."""
    if backend is None:
        return False, "No backend configured"
    try:
        healthy = bool(backend.health())
    except Exception as exc:
        logger.warning("Backend health probe failed for %s: %s", getattr(backend, "backend_id", type(backend).__name__), exc)
        return False, str(exc)
    if healthy:
        return True, ""
    return False, "Backend reported unhealthy"


def _safe_voice_loop_status(voice_loop: Any) -> dict[str, Any]:
    """Return voice loop status without raising into the HUD."""
    if voice_loop is None:
        return {
            "active": False,
            "phase": "idle",
            "session_id": None,
            "started_at": None,
            "updated_at": None,
            "backend_available": False,
            "backend_name": None,
            "language_hints": ["no", "en"],
            "live_vad_enabled": False,
            "vad_backend": "energy",
            "wake_requested_backend": "transcript",
            "wake_backend": "transcript",
            "wake_available": True,
            "wake_reason": "",
            "last_vad_rms": 0.0,
            "last_wake_score": None,
            "last_transcript": "",
            "recent_transcripts": [],
            "last_transcribe_ms": 0.0,
            "last_process_ms": 0.0,
            "last_audio_duration_seconds": 0.0,
            "interruption_count": 0,
            "last_interruption_at": None,
            "tts_active": False,
            "tts_started_at": None,
            "last_error": "Voice loop manager not configured",
        }
    try:
        return voice_loop.status()
    except Exception as exc:
        logger.warning("Voice loop status probe failed: %s", exc)
        return {
            "active": False,
            "phase": "error",
            "session_id": None,
            "started_at": None,
            "updated_at": None,
            "backend_available": False,
            "backend_name": getattr(voice_loop, "backend_id", None),
            "language_hints": ["no", "en"],
            "live_vad_enabled": False,
            "vad_backend": "energy",
            "wake_requested_backend": "transcript",
            "wake_backend": "transcript",
            "wake_available": False,
            "wake_reason": str(exc),
            "last_vad_rms": 0.0,
            "last_wake_score": None,
            "last_transcript": "",
            "recent_transcripts": [],
            "last_transcribe_ms": 0.0,
            "last_process_ms": 0.0,
            "last_audio_duration_seconds": 0.0,
            "interruption_count": 0,
            "last_interruption_at": None,
            "tts_active": False,
            "tts_started_at": None,
            "last_error": str(exc),
        }


def _desktop_report_status(repo_root: Path) -> tuple[str, str, str]:
    report_path = repo_root / "desktop-readiness-report.txt"
    if not report_path.exists():
        return (
            "warning",
            "No combined desktop readiness report found yet.",
            "Run collect_openjarvis_desktop_report.bat or the PowerShell script to generate a fresh report.",
        )
    try:
        content = report_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return (
            "warning",
            "Desktop readiness report exists but could not be read.",
            "Re-run the combined desktop report script to refresh the artifact.",
        )
    lowered = content.lower()
    if "wdac" in lowered or "code integrity" in lowered or "app control" in lowered:
        return (
            "blocked",
            "Windows policy is still blocking native desktop packaging.",
            "Use the policy checker and unblock WDAC / App Control before retrying native packaging.",
        )
    if "mostly ready" in lowered or "environment is mostly ready" in lowered:
        return (
            "ready",
            "Desktop environment report looks ready enough for native packaging.",
            "Retry the desktop build if you want to validate the native path again.",
        )
    return (
        "warning",
        "Desktop readiness report is present but does not clearly confirm readiness.",
        "Review the report contents before assuming native packaging is ready.",
    )


def _knowledge_owner_user_id(request: Request) -> str:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        return ""
    return str(user.get("id") or "").strip()


def build_runtime_readiness(app_state: Any) -> dict[str, Any]:
    repo_root = Path.cwd()
    speech_backend = getattr(app_state, "speech_backend", None)
    voice_loop = getattr(app_state, "voice_loop", None)
    speech_backend_healthy, speech_backend_error = _safe_backend_health(speech_backend)
    voice_status = _safe_voice_loop_status(voice_loop)
    api_key_present = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    openai_ready = _package_ready("openai")
    docx_ready = _package_ready("docx")
    openpyxl_ready = _package_ready("openpyxl")
    pptx_ready = _package_ready("pptx")
    desktop_script = repo_root / "check_openjarvis_desktop.ps1"
    desktop_policy_script = repo_root / "check_openjarvis_desktop_policy.ps1"
    desktop_collect_script = repo_root / "collect_openjarvis_desktop_report.ps1"
    desktop_docs = repo_root / "docs" / "deployment" / "windows-desktop-unblock.md"
    report_status, report_detail, report_recommendation = _desktop_report_status(repo_root)

    checks = [
        {
            "id": "speech-backend",
            "label": "Speech Backend",
            "status": "ready" if speech_backend_healthy else "blocked",
            "detail": (
                f"Speech backend is available via {getattr(speech_backend, 'backend_id', 'configured backend')}."
                if speech_backend_healthy
                else (
                    f"Speech backend is not healthy: {speech_backend_error}"
                    if speech_backend_error
                    else "Speech backend is not configured or not healthy."
                )
            ),
            "recommendation": (
                "Speech is ready for voice input."
                if speech_backend_healthy
                else "Configure a speech backend before relying on voice input."
            ),
        },
        {
            "id": "voice-loop",
            "label": "Voice Loop",
            "status": "ready" if voice_loop is not None else "warning",
            "detail": (
                f"Voice loop is {voice_status.get('phase') or 'idle'}."
                if voice_loop is not None
                else "Voice loop manager is not configured."
            ),
            "recommendation": (
                "Voice loop is available for always-listening mode."
                if voice_loop is not None
                else "Start the server with voice loop support enabled if you want hands-free use."
            ),
        },
        {
            "id": "vision-runtime",
            "label": "Vision Runtime",
            "status": "ready" if api_key_present and openai_ready else "blocked",
            "detail": (
                "OPENAI_API_KEY and OpenAI vision runtime are available."
                if api_key_present and openai_ready
                else "Vision analysis needs OPENAI_API_KEY and the openai package."
            ),
            "recommendation": (
                "Vision and screen understanding are ready."
                if api_key_present and openai_ready
                else "Add OPENAI_API_KEY and install the OpenAI package to enable full vision flows."
            ),
        },
        {
            "id": "document-intel",
            "label": "Document Intelligence",
            "status": "ready" if api_key_present and openai_ready else "blocked",
            "detail": (
                "Document analysis can use the configured model runtime."
                if api_key_present and openai_ready
                else "Document analysis is blocked because the model runtime is not fully configured."
            ),
            "recommendation": (
                "Upload and analyze PDF / Office files normally."
                if api_key_present and openai_ready
                else "Configure the OpenAI runtime before relying on Document Intel."
            ),
        },
        {
            "id": "office-exports",
            "label": "Office Parsers & Export",
            "status": "ready" if docx_ready and openpyxl_ready and pptx_ready else "warning",
            "detail": (
                "DOCX, XLSX, and PPTX packages are installed."
                if docx_ready and openpyxl_ready and pptx_ready
                else "One or more Office parsing/export packages are missing."
            ),
            "recommendation": (
                "Office parsing and export paths are ready."
                if docx_ready and openpyxl_ready and pptx_ready
                else "Install python-docx, openpyxl, and python-pptx for full Office support."
            ),
        },
        {
            "id": "desktop-tooling",
            "label": "Desktop Diagnostics",
            "status": "ready" if desktop_script.exists() and desktop_policy_script.exists() and desktop_collect_script.exists() else "warning",
            "detail": (
                "Desktop readiness, policy, and combined report scripts are present."
                if desktop_script.exists() and desktop_policy_script.exists() and desktop_collect_script.exists()
                else "One or more desktop diagnostics scripts are missing from the repo root."
            ),
            "recommendation": (
                "Use the root desktop scripts when native packaging needs debugging."
                if desktop_script.exists() and desktop_policy_script.exists() and desktop_collect_script.exists()
                else "Restore the desktop diagnostic scripts before troubleshooting native packaging."
            ),
        },
        {
            "id": "desktop-report",
            "label": "Desktop Packaging Status",
            "status": report_status,
            "detail": report_detail,
            "recommendation": report_recommendation,
        },
        {
            "id": "desktop-docs",
            "label": "Desktop Unblock Guide",
            "status": "ready" if desktop_docs.exists() else "warning",
            "detail": (
                "Windows desktop unblock guide is present in docs."
                if desktop_docs.exists()
                else "Windows desktop unblock guide is missing."
            ),
            "recommendation": (
                "Use the unblock guide before changing desktop code."
                if desktop_docs.exists()
                else "Restore the desktop unblock guide for native troubleshooting."
            ),
        },
    ]
    ready_count = sum(1 for item in checks if item["status"] == "ready")
    blocked_count = sum(1 for item in checks if item["status"] == "blocked")
    return {
        "summary": {
            "ready": ready_count,
            "blocked": blocked_count,
            "total": len(checks),
        },
        "checks": checks,
        "desktop": {
            "report_path": str(repo_root / "desktop-readiness-report.txt"),
            "scripts": {
                "check": str(desktop_script),
                "policy": str(desktop_policy_script),
                "collect": str(desktop_collect_script),
            },
            "guide_path": str(desktop_docs),
        },
    }

# ---- Request/Response models ----


class AgentCreateRequest(BaseModel):
    agent_type: str
    tools: Optional[List[str]] = None
    agent_id: Optional[str] = None


class AgentMessageRequest(BaseModel):
    message: str


class MemoryStoreRequest(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = None


class MemorySearchRequest(BaseModel):
    query: str
    top_k: int = 5


class BudgetLimitsRequest(BaseModel):
    max_tokens_per_day: Optional[int] = None
    max_requests_per_hour: Optional[int] = None


class FeedbackScoreRequest(BaseModel):
    trace_id: str
    score: float
    source: str = "api"


class OptimizeRunRequest(BaseModel):
    benchmark: str
    max_trials: int = 20
    optimizer_model: str = "claude-sonnet-4-6"
    max_samples: int = 50


class VoiceLoopStartRequest(BaseModel):
    language_hints: Optional[List[str]] = None


class VoiceLoopUpdateRequest(BaseModel):
    phase: Literal[
        "idle",
        "listening",
        "recording",
        "transcribing",
        "speaking",
        "error",
    ]
    transcript: Optional[str] = None
    error: Optional[str] = None


class VoiceLoopIngestRequest(BaseModel):
    transcript: str


class VoiceLoopInterruptRequest(BaseModel):
    reason: Optional[str] = None


class VoiceLoopProcessResponse(BaseModel):
    accepted: bool
    wake_matched: bool
    command: str
    message: str
    transcript: str = ""
    language: Optional[str] = None
    confidence: Optional[float] = None
    duration_seconds: float = 0.0
    interrupted: bool = False


class SpeechSynthesizeRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    backend: Optional[str] = None
    speed: Optional[float] = None
    output_format: str = "wav"


class WorkbenchStageRequest(BaseModel):
    command: str
    working_dir: Optional[str] = None
    timeout: int = 30
    metadata: Optional[dict[str, str | bool]] = None


class WorkspaceRepoRegisterRequest(BaseModel):
    path: str


class WorkspaceRepoSelectRequest(BaseModel):
    root: str


class WorkspaceGitActionRequest(BaseModel):
    message: Optional[str] = None


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


class OperatorProfileUpdateRequest(BaseModel):
    honorific: Optional[str] = None
    reply_tone: Optional[str] = None
    verbosity_preference: Optional[str] = None
    technical_depth: Optional[str] = None
    decisiveness_preference: Optional[str] = None
    autonomy_preference: Optional[str] = None
    personality_notes: Optional[str] = None
    priority_contacts: Optional[List[str] | str] = None
    workday_start: Optional[str] = None
    workday_end: Optional[str] = None


class OperatorSignalRequest(BaseModel):
    kind: Literal["reply", "meeting", "task", "urgent"]
    contact: Optional[str] = None


class OperatorRelationshipUpdateRequest(BaseModel):
    contact: str
    name: Optional[str] = None
    importance: Optional[str] = None
    relationship: Optional[str] = None
    notes: Optional[str] = None


class OperatorMeetingUpdateRequest(BaseModel):
    key: str
    title: Optional[str] = None
    importance: Optional[str] = None
    prep_style: Optional[str] = None
    notes: Optional[str] = None


class OperatorProjectUpdateRequest(BaseModel):
    key: str
    title: Optional[str] = None
    focus: Optional[str] = None
    status: Optional[str] = None
    next_step: Optional[str] = None
    notes: Optional[str] = None


class OperatorCodingRepoUpdateRequest(BaseModel):
    key: str
    title: Optional[str] = None
    convention_notes: Optional[str] = None
    workflow_notes: Optional[str] = None
    preferred_verification_commands: Optional[list[str]] = None
    common_pitfalls: Optional[list[str]] = None
    repeated_failures: Optional[list[str]] = None
    last_successful_verification: Optional[str] = None


class OperatorSalesAccountUpdateRequest(BaseModel):
    key: str
    name: Optional[str] = None
    owner: Optional[str] = None
    segment: Optional[str] = None
    status: Optional[str] = None
    next_step: Optional[str] = None
    risk_level: Optional[str] = None
    last_interaction: Optional[str] = None
    notes: Optional[str] = None


class OperatorSalesLeadUpdateRequest(BaseModel):
    key: str
    name: Optional[str] = None
    company: Optional[str] = None
    owner: Optional[str] = None
    stage: Optional[str] = None
    source: Optional[str] = None
    next_step: Optional[str] = None
    risk_level: Optional[str] = None
    last_interaction: Optional[str] = None
    notes: Optional[str] = None


class OperatorSalesDealUpdateRequest(BaseModel):
    key: str
    title: Optional[str] = None
    account_key: Optional[str] = None
    owner: Optional[str] = None
    stage: Optional[str] = None
    value: Optional[str] = None
    close_target: Optional[str] = None
    next_step: Optional[str] = None
    risk_level: Optional[str] = None
    last_interaction: Optional[str] = None
    notes: Optional[str] = None


class OperatorCustomerAccountUpdateRequest(BaseModel):
    key: str
    name: Optional[str] = None
    owner: Optional[str] = None
    segment: Optional[str] = None
    health: Optional[str] = None
    sentiment: Optional[str] = None
    churn_risk: Optional[str] = None
    next_step: Optional[str] = None
    last_interaction: Optional[str] = None
    notes: Optional[str] = None


class OperatorCustomerInteractionUpdateRequest(BaseModel):
    key: str
    account_key: Optional[str] = None
    contact: Optional[str] = None
    channel: Optional[str] = None
    topic: Optional[str] = None
    sentiment: Optional[str] = None
    urgency: Optional[str] = None
    status: Optional[str] = None
    promised_follow_up: Optional[str] = None
    last_interaction: Optional[str] = None
    notes: Optional[str] = None


class OperatorVisualObservationRequest(BaseModel):
    label: str
    source: Optional[str] = "screen"
    note: str
    image_data_url: Optional[str] = None
    created_at: Optional[str] = None


class OperatorVisualInsightRequest(BaseModel):
    label: str
    question: str
    answer: str
    created_at: Optional[str] = None


class OperatorVisualBriefRequest(BaseModel):
    label: str
    summary: str
    details: Optional[str] = None
    created_at: Optional[str] = None


class OperatorDocumentBriefRequest(BaseModel):
    label: str
    mode: str
    summary: str
    details: Optional[str] = None
    created_at: Optional[str] = None


class OperatorDesignBriefRequest(BaseModel):
    label: str
    archetype: str
    summary: str
    details: Optional[str] = None
    scorecard: Optional[list[Dict[str, Any]]] = None
    created_at: Optional[str] = None


class OperatorFivemBriefRequest(BaseModel):
    label: str
    resource_key: str
    framework: str
    topology: str
    summary: str
    details: Optional[str] = None
    native_families: Optional[list[str]] = None
    risk_tags: Optional[list[str]] = None
    created_at: Optional[str] = None


class OperatorLearningExperienceRequest(BaseModel):
    label: str
    domain: str
    context_key: Optional[str] = None
    outcome_type: Optional[str] = "lesson"
    summary: str
    lesson: Optional[str] = None
    reuse_hint: Optional[str] = None
    tags: Optional[list[str]] = None
    confidence: Optional[float] = None
    created_at: Optional[str] = None


class OperatorLearningReuseRequest(BaseModel):
    ids: list[str]
    reused_at: Optional[str] = None


class OperatorMemoryContextRequest(BaseModel):
    query: str
    limit: Optional[int] = 6


class OperatorMemoryAnalyticsResponse(BaseModel):
    signals: dict[str, Any]
    active_missions: list[dict[str, Any]]
    blocked_missions: list[dict[str, Any]]
    top_lessons: list[dict[str, Any]]
    focus_recommendations: list[str]
    review_items: list[dict[str, Any]]
    recurring_patterns: list[dict[str, Any]]
    improvement_opportunities: list[str]
    friction_brief: dict[str, Any]
    operating_profile: dict[str, Any]


class OperatorCommanderQueueItem(BaseModel):
    id: str
    label: str
    title: str
    detail: str
    action_label: str
    action_hint: str
    execution_lane: str
    verification_signal: str
    priority: int


class OperatorCommanderExecutionPhase(BaseModel):
    phase: str
    goal: str
    success_signal: str


class OperatorCommanderBriefResponse(BaseModel):
    headline: str
    recommendation: str
    why: str
    friction_summary: str
    root_cause: str
    risks: list[str]
    best_next_step: str
    queue: list[OperatorCommanderQueueItem]
    execution_plan: list[OperatorCommanderExecutionPhase]
    execution_summary: str
    operating_mode: str
    interaction_style: str
    user_temperament: str
    command_posture: str
    guidance_note: str
    planner_prompt: str


class OperatorCodingCommanderPhase(BaseModel):
    phase: str
    goal: str
    verification: str


class OperatorCodingCommanderBriefResponse(BaseModel):
    headline: str
    repo_name: str
    repo_root: str
    branch: str
    objective: str
    workflow_mode: str
    recommendation: str
    why: str
    best_next_step: str
    risks: list[str]
    phases: list[OperatorCodingCommanderPhase]
    checklist: list[str]
    deliverables: list[str]
    exit_criteria: list[str]
    report_template: str
    preferred_checks: list[str]
    execution_summary: str
    planner_prompt: str
    user_temperament: str


class AgentArchitectureHandoffMetadata(BaseModel):
    objective: Optional[str] = None
    workflow_mode: Optional[str] = None
    repo_name: Optional[str] = None
    repo_root: Optional[str] = None
    branch: Optional[str] = None
    preferred_checks: list[str] = []
    deliverables: list[str] = []
    exit_criteria: list[str] = []
    report_template: Optional[str] = None


class OperatorReviewItemRequest(BaseModel):
    category: Optional[str] = "quality"
    label: Optional[str] = None
    summary: str
    detail: Optional[str] = None
    source: Optional[str] = "manual"
    status: Optional[str] = "open"


class OperatorMissionUpdateRequest(BaseModel):
    id: str
    title: str
    domain: Optional[str] = None
    status: Optional[str] = None
    phase: Optional[str] = None
    summary: Optional[str] = None
    next_step: Optional[str] = None
    result: Optional[str] = None
    retry_hint: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    next_action: Optional[Dict[str, Any]] = None
    updated_at: Optional[str] = None


class OperatorMissionActionRequest(BaseModel):
    id: str
    action: Literal["resume", "retry", "complete", "block"]
    summary: Optional[str] = None
    result: Optional[str] = None
    retry_hint: Optional[str] = None


def _mission_followup_payload(mission: dict[str, Any], action: str) -> dict[str, Any] | None:
    domain = str(mission.get("domain", "")).strip().lower()
    status = str(mission.get("status", "")).strip().lower()
    summary = str(mission.get("summary", "")).strip()
    result = str(mission.get("result", "")).strip()
    next_step = str(mission.get("next_step", "")).strip()
    title = str(mission.get("title", "mission")).strip() or "mission"
    result_data = mission.get("result_data") if isinstance(mission.get("result_data"), dict) else {}
    next_action = mission.get("next_action")
    if action in {"resume", "retry"} and isinstance(next_action, dict) and next_action.get("kind"):
        enriched = dict(next_action)
        enriched.setdefault("label", title)
        if enriched.get("kind") == "task" and not enriched.get("content"):
            enriched["content"] = result or summary or next_step
        return enriched

    if action not in {"resume", "retry"}:
        return None
    blocked = action == "retry" or status == "blocked"
    if domain == "planner":
        content = result or summary or next_step
        if not content:
            return None
        return {
            "kind": "handoff",
            "content": content,
            "label": "Planner Retry" if blocked else title,
            "source": "planner-mission",
        }
    if domain == "self-improve":
        content = result or summary or next_step
        if not content:
            return None
        file_path = str(result_data.get("file_path", "")).strip()
        if blocked:
            details = [f"Mission: {title}", content]
            if file_path:
                details.insert(1, f"Target file: {file_path}")
            return {
                "kind": "task",
                "content": "\n".join(details),
                "label": f"Repair {file_path or title}",
                "source": "self-improve-mission",
            }
        return {"kind": "prompt", "content": content, "label": title, "source": "self-improve-mission"}
    if domain == "visual":
        content = result or summary or next_step
        if not content:
            return None
        if blocked:
            return {
                "kind": "task",
                "content": f"Visual mission blocker.\n{content}\nRetry hint: {str(mission.get('retry_hint', '')).strip()}",
                "label": f"{title} Follow-up",
                "source": "visual-mission",
            }
        return {"kind": "prompt", "content": content, "label": title, "source": "visual-mission"}
    if domain == "document":
        content = result or summary or next_step
        if not content:
            return None
        mode = str(result_data.get("mode", "")).strip().lower()
        if mode in {"business_review", "finance_review", "investment_memo", "kpi_extract"}:
            return {"kind": "brief", "content": content, "label": f"{title} Memo", "source": "document-mission"}
        if blocked:
            return {
                "kind": "task",
                "content": f"Document mission blocker.\nMode: {mode or 'summary'}\n{content}",
                "label": f"{title} Follow-up",
                "source": "document-mission",
            }
        return {"kind": "prompt", "content": content, "label": title, "source": "document-mission"}
    if domain == "design":
        content = result or summary or next_step
        if not content:
            return None
        weakest_area = str(result_data.get("weakest_area", "")).strip()
        if blocked:
            area_label = weakest_area or "HUD quality"
            return {
                "kind": "task",
                "content": f"Design mission blocker.\nWeakest area: {area_label}\n{content}",
                "label": f"Improve {area_label}",
                "source": "design-mission",
            }
        return {"kind": "prompt", "content": content, "label": title, "source": "design-mission"}
    if domain == "shopify":
        content = result or summary or next_step
        if not content:
            return None
        store = str(result_data.get("store", "")).strip() or "store"
        open_orders = str(result_data.get("open_orders", "")).strip()
        low_stock = str(result_data.get("low_stock_products", "")).strip()
        repeat_customers = str(result_data.get("repeat_customers", "")).strip()
        details = [
            f"Shopify mission for {store}.",
            content,
        ]
        if open_orders:
            details.append(f"Open orders: {open_orders}")
        if low_stock:
            details.append(f"Low-stock products: {low_stock}")
        if repeat_customers:
            details.append(f"Repeat customers: {repeat_customers}")
        if blocked:
            return {
                "kind": "task",
                "content": "\n".join(details),
                "label": f"{title} Follow-up",
                "source": "shopify-mission",
            }
        return {
            "kind": "brief",
            "content": "\n".join(details),
            "label": f"{title} Ops Brief",
            "source": "shopify-mission",
        }
    if domain == "commercial":
        content = result or summary or next_step
        if not content:
            return None
        pipeline_risk = str(result_data.get("pipeline_risk", "")).strip()
        customer_pressure = str(result_data.get("customer_pressure", "")).strip()
        store_pressure = str(result_data.get("store_pressure", "")).strip()
        details = [
            "Commercial operating mission.",
            content,
        ]
        if pipeline_risk:
            details.append(f"Pipeline risk: {pipeline_risk}")
        if customer_pressure:
            details.append(f"Customer pressure: {customer_pressure}")
        if store_pressure:
            details.append(f"Store pressure: {store_pressure}")
        if blocked:
            return {
                "kind": "task",
                "content": "\n".join(details),
                "label": f"{title} Follow-up",
                "source": "commercial-mission",
            }
        return {
            "kind": "brief",
            "content": "\n".join(details),
            "label": f"{title} Brief",
            "source": "commercial-mission",
        }
    if domain == "fivem":
        content = result or summary or next_step
        if not content:
            return None
        framework = str(result_data.get("framework", "")).strip()
        topology = str(result_data.get("topology", "")).strip()
        focus_area = str(result_data.get("focus_area", "")).strip()
        native_families = str(result_data.get("native_families", "")).strip()
        details = [
            "FiveM / Lua coding mission.",
            content,
        ]
        if framework:
            details.append(f"Framework: {framework}")
        if topology:
            details.append(f"Topology: {topology}")
        if native_families:
            details.append(f"Native families: {native_families}")
        if focus_area:
            details.append(f"Focus area: {focus_area}")
        if blocked:
            label = f"{title} Follow-up"
            if "network" in native_families.lower():
                label = "Review Network Safety"
            elif "state" in native_families.lower():
                label = "Audit State Flow"
            elif framework:
                label = f"Review {framework} Flow"
            return {
                "kind": "task",
                "content": "\n".join(details),
                "label": label,
                "source": "fivem-mission",
            }
        return {
            "kind": "prompt",
            "content": "\n".join(details),
            "label": f"{title} Review",
            "source": "fivem-mission",
        }
    return None


def _record_learning_from_mission_action(
    manager: Any,
    mission: dict[str, Any],
    action: str,
    *,
    summary_override: str = "",
    result_override: str = "",
    retry_hint_override: str = "",
) -> None:
    domain = str(mission.get("domain", "")).strip().lower()
    if not domain:
        return
    title = str(mission.get("title", "Mission")).strip() or "Mission"
    result_data = mission.get("result_data") if isinstance(mission.get("result_data"), dict) else {}
    summary = summary_override.strip() or str(mission.get("summary", "")).strip()
    result = result_override.strip() or str(mission.get("result", "")).strip()
    retry_hint = retry_hint_override.strip() or str(mission.get("retry_hint", "")).strip()
    context_key = (
        str(result_data.get("file_path", "")).strip()
        or str(result_data.get("resource_key", "")).strip()
        or str(result_data.get("store", "")).strip()
        or str(result_data.get("brief_label", "")).strip()
        or domain
    )
    outcome_type = "success" if action == "complete" else "mistake" if action in {"retry", "block"} else "lesson"
    lesson = result or summary or retry_hint
    if not lesson:
        return
    if domain == "fivem":
        framework = str(result_data.get("framework", "")).strip()
        topology = str(result_data.get("topology", "")).strip()
        native_families = str(result_data.get("native_families", "")).strip()
        reuse_hint = retry_hint or (
            "Narrow the next FiveM pass to one framework boundary, native family, or startup assumption."
            if outcome_type == "mistake"
            else "Reuse the same FiveM review pattern on similar framework/topology resources."
        )
        tags = [domain, framework.lower(), topology.lower(), outcome_type]
        if native_families:
            tags.extend([item.strip().lower() for item in native_families.split(",") if item.strip()])
    elif domain in {"coding", "self-improve"}:
        file_path = str(result_data.get("file_path", "")).strip()
        reuse_hint = retry_hint or (
            "Reduce the patch scope and rerun the same validation first."
            if outcome_type == "mistake"
            else "Reuse this fix/check pattern when the same file or failure family appears again."
        )
        tags = [domain, outcome_type]
        if file_path:
            tags.append("file-scoped")
    elif domain == "design":
        weakest_area = str(result_data.get("weakest_area", "")).strip()
        reuse_hint = retry_hint or (
            "Start from the weakest scored HUD area before making broader changes."
            if outcome_type == "mistake"
            else "Carry the strongest hierarchy and clarity decisions into the next HUD pass."
        )
        tags = [domain, weakest_area.lower(), outcome_type]
    elif domain in {"visual", "document"}:
        reuse_hint = retry_hint or (
            "Reuse this analysis pattern when similar inputs appear again."
        )
        tags = [domain, outcome_type]
    elif domain in {"commercial", "sales", "customer", "shopify"}:
        reuse_hint = retry_hint or (
            "Prioritize the highest combined business pressure first on the next commercial pass."
            if outcome_type == "mistake"
            else "Reuse this business sequencing when similar operating pressure appears again."
        )
        tags = [domain, outcome_type]
    else:
        reuse_hint = retry_hint or "Reuse this lesson when the same context appears again."
        tags = [domain, outcome_type]
    try:
        manager.add_learning_experience(
            label=f"{title} {action}",
            domain=domain,
            context_key=context_key,
            outcome_type=outcome_type,
            summary=summary or f"{title} {action}",
            lesson=lesson[:800],
            reuse_hint=reuse_hint[:400],
            tags=[tag for tag in tags if tag],
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        if outcome_type == "mistake":
            _promote_antipattern_learning(
                manager,
                domain=domain,
                context_key=context_key,
                summary=summary or f"{title} blocker pattern",
                lesson=lesson,
                reuse_hint=reuse_hint,
                tags=[tag for tag in tags if tag],
            )
    except Exception:
        return


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


class AgentArchitectureHandoffRequest(BaseModel):
    brief: str
    source: Optional[str] = "hud"
    metadata: Optional[Dict[str, Any]] = None


class RoutineScheduleRequest(BaseModel):
    routine_id: Literal["daily_ops", "inbox_sweep", "meeting_prep"]
    enabled: bool
    cron: Optional[str] = None
    agent: str = "orchestrator"


class VisionAnalyzeRequest(BaseModel):
    image_data_url: str
    note: Optional[str] = None
    label: Optional[str] = None


class VisionAnalyzeMultiRequest(BaseModel):
    images: list[dict[str, str]]
    note: Optional[str] = None
    label: Optional[str] = None


class VisionExtractRequest(BaseModel):
    image_data_url: str
    note: Optional[str] = None
    label: Optional[str] = None


class VisionExtractMultiRequest(BaseModel):
    images: list[dict[str, str]]
    note: Optional[str] = None
    label: Optional[str] = None


class VisionSuggestActionsRequest(BaseModel):
    images: list[dict[str, str]]
    note: Optional[str] = None
    label: Optional[str] = None


class VisionUiTargetsRequest(BaseModel):
    images: list[dict[str, str]]
    note: Optional[str] = None
    label: Optional[str] = None


class VisionUiActionPlanRequest(BaseModel):
    images: list[dict[str, str]]
    target_label: str
    target_detail: Optional[str] = None
    control_type: Optional[str] = None
    note: Optional[str] = None
    label: Optional[str] = None


class VisionUiVerifyRequest(BaseModel):
    images: list[dict[str, str]]
    target_label: str
    target_detail: Optional[str] = None
    control_type: Optional[str] = None
    desktop_intent: Optional[str] = None
    note: Optional[str] = None
    label: Optional[str] = None


class VisionQueryRequest(BaseModel):
    images: list[dict[str, str]]
    question: str
    note: Optional[str] = None
    label: Optional[str] = None
    history: list[dict[str, str]] = []


# ---- Agent routes ----

agents_router = APIRouter(prefix="/v1/agents", tags=["agents"])


@agents_router.get("")
async def list_agents(request: Request):
    """List available agent types and running agents."""
    registered = []
    try:
        import openjarvis.agents  # noqa: F401 — side-effect registration
        from openjarvis.core.registry import AgentRegistry

        for key in sorted(AgentRegistry.keys()):
            cls = AgentRegistry.get(key)
            registered.append(
                {
                    "key": key,
                    "class": cls.__name__,
                    "accepts_tools": getattr(cls, "accepts_tools", False),
                }
            )
    except Exception as exc:
        logger.warning("Failed to list registered agents: %s", exc)

    running = []
    try:
        from openjarvis.tools.agent_tools import _SPAWNED_AGENTS

        running = [{"id": k, **v} for k, v in _SPAWNED_AGENTS.items()]
    except ImportError:
        pass

    return {"registered": registered, "running": running}


@agents_router.post("")
async def create_agent(req: AgentCreateRequest, request: Request):
    """Spawn a new agent."""
    try:
        from openjarvis.tools.agent_tools import AgentSpawnTool

        tool = AgentSpawnTool()
        params = {"agent_type": req.agent_type}
        if req.tools:
            params["tools"] = ",".join(req.tools)
        if req.agent_id:
            params["agent_id"] = req.agent_id
        result = tool.execute(**params)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.content)
        return {
            "status": "created",
            "content": result.content,
            "metadata": result.metadata,
        }
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


@agents_router.delete("/{agent_id}")
async def kill_agent(agent_id: str, request: Request):
    """Kill a running agent."""
    try:
        from openjarvis.tools.agent_tools import AgentKillTool

        tool = AgentKillTool()
        result = tool.execute(agent_id=agent_id)
        if not result.success:
            raise HTTPException(status_code=404, detail=result.content)
        return {"status": "stopped", "agent_id": agent_id}
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


@agents_router.post("/{agent_id}/message")
async def message_agent(agent_id: str, req: AgentMessageRequest, request: Request):
    """Send a message to a running agent."""
    try:
        from openjarvis.tools.agent_tools import AgentSendTool

        tool = AgentSendTool()
        result = tool.execute(agent_id=agent_id, message=req.message)
        if not result.success:
            raise HTTPException(status_code=404, detail=result.content)
        return {"status": "sent", "content": result.content}
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


# ---- Memory routes ----

memory_router = APIRouter(prefix="/v1/memory", tags=["memory"])


@memory_router.post("/store")
async def memory_store(req: MemoryStoreRequest, request: Request):
    """Store content in memory."""
    try:
        from openjarvis.tools.storage.sqlite import SQLiteMemory

        backend = SQLiteMemory()
        backend.store(req.content, metadata=req.metadata or {})
        return {"status": "stored"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@memory_router.post("/search")
async def memory_search(req: MemorySearchRequest, request: Request):
    """Search memory for relevant content."""
    try:
        from openjarvis.tools.storage.sqlite import SQLiteMemory

        backend = SQLiteMemory()
        results = backend.search(req.query, top_k=req.top_k)
        items = [
            {"content": r.content, "score": r.score, "metadata": r.metadata}
            for r in results
        ]
        return {"results": items}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@memory_router.get("/stats")
async def memory_stats(request: Request):
    """Get memory backend statistics."""
    try:
        from openjarvis.tools.storage.sqlite import SQLiteMemory

        backend = SQLiteMemory()
        stats = backend.stats()
        return stats
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Traces routes ----

traces_router = APIRouter(prefix="/v1/traces", tags=["traces"])


def _serialise_trace(trace) -> dict:
    """Convert a Trace dataclass to a frontend-friendly dict."""
    import datetime
    from dataclasses import asdict

    d = asdict(trace)
    d["id"] = d.pop("trace_id", "")
    started = d.pop("started_at", 0.0)
    d["created_at"] = (
        datetime.datetime.fromtimestamp(started, tz=datetime.timezone.utc).isoformat()
        if started
        else None
    )
    dur = d.pop("total_latency_seconds", 0.0)
    d["duration_ms"] = round(dur * 1000)
    for step in d.get("steps", []):
        st = step.get("step_type")
        if hasattr(st, "value"):
            step["step_type"] = st.value
    return d


@traces_router.get("")
async def list_traces(request: Request, limit: int = 20):
    """List recent traces."""
    try:
        store = getattr(request.app.state, "trace_store", None)
        if store is None:
            return {"traces": []}
        traces = store.list_traces(limit=limit)
        items = [_serialise_trace(t) for t in traces]
        return {"traces": items}
    except Exception as exc:
        return {"traces": [], "error": str(exc)}


@traces_router.get("/{trace_id}")
async def get_trace(trace_id: str, request: Request):
    """Get a specific trace by ID."""
    try:
        store = getattr(request.app.state, "trace_store", None)
        if store is None:
            raise HTTPException(status_code=404, detail="Trace not found")
        trace = store.get(trace_id)
        if trace is None:
            raise HTTPException(status_code=404, detail="Trace not found")
        return _serialise_trace(trace)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Telemetry routes ----

telemetry_router = APIRouter(prefix="/v1/telemetry", tags=["telemetry"])


@telemetry_router.get("/stats")
async def telemetry_stats(request: Request):
    """Get aggregated telemetry statistics."""
    try:
        from dataclasses import asdict

        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        if not db_path.exists():
            return {"total_requests": 0, "total_tokens": 0}

        session_start = getattr(request.app.state, "session_start", None)
        agg = TelemetryAggregator(db_path)
        try:
            stats = agg.summary(since=session_start)
            d = asdict(stats)
            d.pop("per_model", None)
            d.pop("per_engine", None)
            d["total_requests"] = d.pop("total_calls", 0)
            return d
        finally:
            agg.close()
    except Exception as exc:
        return {"error": str(exc)}


@telemetry_router.get("/energy")
async def telemetry_energy(request: Request):
    """Get energy monitoring data."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        if not db_path.exists():
            return {
                "total_energy_j": 0,
                "energy_per_token_j": 0,
                "avg_power_w": 0,
                "cpu_temp_c": None,
                "gpu_temp_c": None,
            }

        session_start = getattr(request.app.state, "session_start", None)
        agg = TelemetryAggregator(db_path)
        try:
            stats = agg.summary(since=session_start)
            total_energy = stats.total_energy_joules
            total_tokens = stats.total_tokens
            total_latency = stats.total_latency
            return {
                "total_energy_j": total_energy,
                "energy_per_token_j": (
                    total_energy / total_tokens if total_tokens > 0 else 0
                ),
                "avg_power_w": (
                    total_energy / total_latency if total_latency > 0 else 0
                ),
                "cpu_temp_c": None,
                "gpu_temp_c": None,
            }
        finally:
            agg.close()
    except Exception as exc:
        return {"error": str(exc)}


# ---- Skills routes ----

skills_router = APIRouter(prefix="/v1/skills", tags=["skills"])


@skills_router.get("")
async def list_skills(request: Request):
    """List installed skills."""
    try:
        from openjarvis.core.registry import SkillRegistry

        skills = []
        for key in sorted(SkillRegistry.keys()):
            skills.append({"name": key})
        return {"skills": skills}
    except Exception as exc:
        logger.warning("Failed to list skills: %s", exc)
        return {"skills": []}


@skills_router.post("")
async def install_skill(request: Request):
    """Install a skill (placeholder)."""
    return {
        "status": "not_implemented",
        "message": "Use TOML files in ~/.openjarvis/skills/",
    }


@skills_router.delete("/{skill_name}")
async def remove_skill(skill_name: str, request: Request):
    """Remove a skill (placeholder)."""
    return {
        "status": "not_implemented",
        "message": "Skill removal not yet supported via API",
    }


# ---- Sessions routes ----

sessions_router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


@sessions_router.get("")
async def list_sessions(request: Request, limit: int = 20):
    """List active sessions."""
    try:
        from openjarvis.sessions.store import SessionStore

        store = SessionStore()
        sessions = store.recent(limit=limit)
        items = [s.to_dict() if hasattr(s, "to_dict") else str(s) for s in sessions]
        return {"sessions": items}
    except Exception as exc:
        return {"sessions": [], "error": str(exc)}


@sessions_router.get("/{session_id}")
async def get_session(session_id: str, request: Request):
    """Get a specific session."""
    try:
        from openjarvis.sessions.store import SessionStore

        store = SessionStore()
        session = store.get(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return session.to_dict() if hasattr(session, "to_dict") else {"id": session_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Budget routes ----

budget_router = APIRouter(prefix="/v1/budget", tags=["budget"])

_budget_limits: Dict[str, Any] = {
    "max_tokens_per_day": None,
    "max_requests_per_hour": None,
}
_budget_usage: Dict[str, int] = {
    "tokens_today": 0,
    "requests_this_hour": 0,
}


@budget_router.get("")
async def get_budget(request: Request):
    """Get current budget usage and limits."""
    return {"limits": _budget_limits, "usage": _budget_usage}


@budget_router.put("/limits")
async def set_budget_limits(req: BudgetLimitsRequest, request: Request):
    """Update budget limits."""
    if req.max_tokens_per_day is not None:
        _budget_limits["max_tokens_per_day"] = req.max_tokens_per_day
    if req.max_requests_per_hour is not None:
        _budget_limits["max_requests_per_hour"] = req.max_requests_per_hour
    return {"status": "updated", "limits": _budget_limits}


# ---- Prometheus metrics ----

metrics_router = APIRouter(tags=["metrics"])


@metrics_router.get("/metrics")
async def prometheus_metrics(request: Request):
    """Prometheus-compatible metrics endpoint."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator
        from starlette.responses import PlainTextResponse

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        lines = [
            "# HELP openjarvis_build_info Static OpenJarvis build information",
            "# TYPE openjarvis_build_info gauge",
            'openjarvis_build_info{version="0.1.0"} 1',
            "# HELP openjarvis_uptime_seconds Process uptime in seconds",
            "# TYPE openjarvis_uptime_seconds gauge",
            f"openjarvis_uptime_seconds {_metrics_uptime_seconds(request):.3f}",
            "# HELP openjarvis_voice_loop_active Whether the voice loop is active",
            "# TYPE openjarvis_voice_loop_active gauge",
            f"openjarvis_voice_loop_active {_metrics_voice_loop_active(request)}",
            "# HELP openjarvis_managed_agents_running Number of running managed agents",
            "# TYPE openjarvis_managed_agents_running gauge",
            f"openjarvis_managed_agents_running {_metrics_running_agents(request)}",
        ]

        if db_path.exists():
            agg = TelemetryAggregator(db_path)
            stats = agg.summary()
            lines.extend(
                [
                    "# HELP openjarvis_telemetry_calls_total Total inference calls recorded",
                    "# TYPE openjarvis_telemetry_calls_total counter",
                    f"openjarvis_telemetry_calls_total {stats.total_calls}",
                    "# HELP openjarvis_telemetry_tokens_total Total tokens recorded",
                    "# TYPE openjarvis_telemetry_tokens_total counter",
                    f"openjarvis_telemetry_tokens_total {stats.total_tokens}",
                    "# HELP openjarvis_telemetry_cost_usd_total Total estimated inference cost in USD",
                    "# TYPE openjarvis_telemetry_cost_usd_total counter",
                    f"openjarvis_telemetry_cost_usd_total {stats.total_cost:.6f}",
                    "# HELP openjarvis_telemetry_latency_seconds_total Total recorded inference latency in seconds",
                    "# TYPE openjarvis_telemetry_latency_seconds_total counter",
                    f"openjarvis_telemetry_latency_seconds_total {stats.total_latency:.6f}",
                    "# HELP openjarvis_telemetry_energy_joules_total Total recorded inference energy in joules",
                    "# TYPE openjarvis_telemetry_energy_joules_total counter",
                    f"openjarvis_telemetry_energy_joules_total {stats.total_energy_joules:.6f}",
                ]
            )

        return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain")
    except Exception as exc:
        logger.warning("Failed to collect Prometheus metrics: %s", exc)
        from starlette.responses import PlainTextResponse

        return PlainTextResponse("# No metrics available\n", media_type="text/plain")


def _metrics_uptime_seconds(request: Request) -> float:
    session_start = getattr(request.app.state, "session_start", None)
    if not isinstance(session_start, (int, float)):
        return 0.0
    return max(0.0, time.time() - float(session_start))


def _metrics_voice_loop_active(request: Request) -> int:
    voice_loop = getattr(request.app.state, "voice_loop", None)
    if voice_loop is None:
        return 0
    try:
        snapshot = voice_loop.snapshot() if hasattr(voice_loop, "snapshot") else voice_loop.status()
    except Exception:
        return 0
    active = snapshot.get("active") if isinstance(snapshot, dict) else None
    return 1 if active else 0


def _metrics_running_agents(request: Request) -> int:
    manager = getattr(request.app.state, "agent_manager", None)
    if manager is None:
        return 0
    try:
        agents = manager.list_agents()
    except Exception:
        return 0
    running = 0
    for agent in agents or []:
        status = str(agent.get("status", "")).strip().lower()
        if status == "running":
            running += 1
    return running


# ---- WebSocket streaming routes ----

websocket_router = APIRouter(tags=["websocket"])


@websocket_router.websocket("/v1/chat/stream")
async def websocket_chat_stream(websocket: WebSocket):
    """Stream chat responses over a WebSocket connection.

    Accepts JSON messages of the form::

        {"message": "...", "model": "...", "agent": "..."}

    Sends back JSON chunks::

        {"type": "chunk", "content": "..."}   -- per-token streaming
        {"type": "done",  "content": "..."}   -- final assembled response
        {"type": "error", "detail": "..."}    -- on failure
    """
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                await websocket.send_json(
                    {"type": "error", "detail": "Invalid JSON"},
                )
                continue

            message = data.get("message")
            if not message:
                await websocket.send_json(
                    {"type": "error", "detail": "Missing 'message' field"},
                )
                continue

            model = data.get("model") or getattr(
                websocket.app.state,
                "model",
                "default",
            )
            engine = getattr(websocket.app.state, "engine", None)
            if engine is None:
                await websocket.send_json(
                    {"type": "error", "detail": "No engine configured"},
                )
                continue

            messages = [{"role": "user", "content": message}]

            try:
                # Prefer streaming if the engine supports it
                stream_fn = getattr(engine, "stream", None)
                if stream_fn is not None and (
                    inspect.isasyncgenfunction(stream_fn) or callable(stream_fn)
                ):
                    full_content = ""
                    try:
                        gen = stream_fn(messages, model=model)
                        # Handle both async and sync generators
                        if inspect.isasyncgen(gen):
                            async for token in gen:
                                full_content += token
                                await websocket.send_json(
                                    {"type": "chunk", "content": token},
                                )
                        else:
                            # Sync generator — iterate in a thread to avoid
                            # blocking the event loop
                            for token in gen:
                                full_content += token
                                await websocket.send_json(
                                    {"type": "chunk", "content": token},
                                )
                    except TypeError:
                        # stream() didn't return an iterable; fall back to
                        # generate()
                        result = engine.generate(messages, model=model)
                        content = (
                            result.get("content", "")
                            if isinstance(
                                result,
                                dict,
                            )
                            else str(result)
                        )
                        full_content = content
                        await websocket.send_json(
                            {"type": "chunk", "content": content},
                        )
                    await websocket.send_json(
                        {"type": "done", "content": full_content},
                    )
                else:
                    # No stream method — single-shot generate
                    result = engine.generate(messages, model=model)
                    content = (
                        result.get("content", "")
                        if isinstance(
                            result,
                            dict,
                        )
                        else str(result)
                    )
                    await websocket.send_json(
                        {"type": "chunk", "content": content},
                    )
                    await websocket.send_json(
                        {"type": "done", "content": content},
                    )
            except WebSocketDisconnect:
                raise
            except Exception as exc:
                await websocket.send_json(
                    {"type": "error", "detail": str(exc)},
                )
    except WebSocketDisconnect:
        pass  # Client disconnected — nothing to clean up


# ---- Learning routes ----

learning_router = APIRouter(prefix="/v1/learning", tags=["learning"])


@learning_router.get("/stats")
async def learning_stats(request: Request):
    """Return learning system statistics across all sub-policies."""
    result: Dict[str, Any] = {}

    # Skill discovery
    try:
        from openjarvis.learning.agents.skill_discovery import SkillDiscovery

        discovery = SkillDiscovery()
        result["skill_discovery"] = {
            "available": True,
            "discovered_count": len(discovery.discovered_skills),
        }
    except Exception as exc:
        logger.warning("Failed to load skill discovery stats: %s", exc)
        result["skill_discovery"] = {"available": False}

    return result


@learning_router.get("/policy")
async def learning_policy(request: Request):
    """Return current routing policy configuration."""
    result: Dict[str, Any] = {}

    # Load config and extract learning section
    try:
        from openjarvis.core.config import load_config

        config = load_config()
        lc = config.learning
        result["enabled"] = lc.enabled
        result["update_interval"] = lc.update_interval
        result["auto_update"] = lc.auto_update
        result["routing"] = {
            "policy": lc.routing.policy,
            "min_samples": lc.routing.min_samples,
        }
        result["intelligence"] = {
            "policy": lc.intelligence.policy,
        }
        result["agent"] = {
            "policy": lc.agent.policy,
        }
        result["metrics"] = {
            "accuracy_weight": lc.metrics.accuracy_weight,
            "latency_weight": lc.metrics.latency_weight,
            "cost_weight": lc.metrics.cost_weight,
            "efficiency_weight": lc.metrics.efficiency_weight,
        }
    except Exception as exc:
        logger.warning("Failed to load learning config: %s", exc)
        result["enabled"] = False
        result["routing"] = {"policy": "heuristic", "min_samples": 5}
        result["intelligence"] = {"policy": "none"}
        result["agent"] = {"policy": "none"}
        result["metrics"] = {}

    return result


# ---- Speech routes ----

speech_router = APIRouter(prefix="/v1/speech", tags=["speech"])
system_router = APIRouter(prefix="/v1", tags=["system"])
voice_loop_router = APIRouter(prefix="/v1/voice-loop", tags=["voice-loop"])
workbench_router = APIRouter(prefix="/v1/workbench", tags=["workbench"])
action_center_router = APIRouter(prefix="/v1/action-center", tags=["action-center"])
operator_memory_router = APIRouter(prefix="/v1/operator-memory", tags=["operator-memory"])
vision_router = APIRouter(prefix="/v1/vision", tags=["vision"])
agent_architecture_router = APIRouter(prefix="/v1/agent-architecture", tags=["agent-architecture"])
automation_router = APIRouter(prefix="/v1/automation", tags=["automation"])
workspace_router = APIRouter(prefix="/v1/workspace", tags=["workspace"])
coding_router = APIRouter(prefix="/v1/coding", tags=["coding"])
shopify_router = APIRouter(prefix="/v1/shopify", tags=["shopify"])


@speech_router.post("/transcribe")
async def transcribe_speech(request: Request):
    """Transcribe uploaded audio to text."""
    backend = getattr(request.app.state, "speech_backend", None)
    if backend is None:
        raise HTTPException(status_code=501, detail="Speech backend not configured")

    form = await request.form()
    audio_file = form.get("file")
    if audio_file is None:
        raise HTTPException(status_code=400, detail="Missing 'file' field")

    audio_bytes = await audio_file.read()
    language = form.get("language")

    # Detect format from filename
    filename = getattr(audio_file, "filename", "audio.wav")
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "wav"

    try:
        result = backend.transcribe(audio_bytes, format=ext, language=language or None)
    except Exception as exc:
        logger.warning("Speech transcription failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Speech transcription failed: {exc}")
    return {
        "text": result.text,
        "language": result.language,
        "confidence": result.confidence,
        "duration_seconds": result.duration_seconds,
    }


@speech_router.get("/health")
async def speech_health(request: Request):
    """Check if a speech backend is available."""
    backend = getattr(request.app.state, "speech_backend", None)
    if backend is None:
        return {"available": False, "reason": "No speech backend configured"}
    healthy, error = _safe_backend_health(backend)
    return {
        "available": healthy,
        "backend": getattr(backend, "backend_id", type(backend).__name__),
        "reason": error or None,
    }


@system_router.get("/readiness")
async def runtime_readiness(request: Request):
    return build_runtime_readiness(request.app.state)


@speech_router.get("/profile")
async def speech_profile(request: Request):
    """Return the active speech + reply voice profile."""
    config = getattr(request.app.state, "config", None)
    speech_cfg = getattr(config, "speech", None)
    if speech_cfg is None:
        return {
            "input_languages": ["no", "en"],
            "reply_language": "en",
            "wake_phrases": ["hey jarvis", "ok jarvis", "jarvis"],
            "live_vad_enabled": True,
            "vad_backend": "energy",
            "audio_chunk_ms": 2200,
            "wake_backend": "transcript",
            "reply_backend": "kokoro",
            "reply_voice_id": "am_michael",
            "auto_speak": True,
            "auto_submit_voice_commands": True,
        }
    hints = [h.strip() for h in speech_cfg.language_hints.split(",") if h.strip()]
    phrases = [p.strip() for p in speech_cfg.wake_phrases.split(",") if p.strip()]
    return {
        "input_languages": hints or ["no", "en"],
        "reply_language": speech_cfg.reply_language,
        "wake_phrases": phrases or ["hey jarvis", "ok jarvis", "jarvis"],
        "live_vad_enabled": speech_cfg.live_vad_enabled,
        "vad_backend": speech_cfg.vad_backend,
        "audio_chunk_ms": speech_cfg.audio_chunk_ms,
        "wake_backend": speech_cfg.wake_backend,
        "reply_backend": speech_cfg.reply_backend,
        "reply_voice_id": speech_cfg.reply_voice_id,
        "reply_speed": speech_cfg.reply_speed,
        "auto_speak": speech_cfg.auto_speak,
        "auto_submit_voice_commands": speech_cfg.auto_submit_voice_commands,
        "require_wake_phrase": speech_cfg.require_wake_phrase,
    }


@speech_router.post("/synthesize")
async def synthesize_speech(req: SpeechSynthesizeRequest, request: Request):
    """Synthesize assistant speech using the configured reply voice."""
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    config = getattr(request.app.state, "config", None)
    speech_cfg = getattr(config, "speech", None)
    backend_key = req.backend or getattr(speech_cfg, "reply_backend", "kokoro")
    voice_id = req.voice_id or getattr(speech_cfg, "reply_voice_id", "am_michael")
    speed = req.speed if req.speed is not None else getattr(speech_cfg, "reply_speed", 0.95)

    import openjarvis.speech  # noqa: F401
    from openjarvis.core.registry import TTSRegistry

    if not TTSRegistry.contains(backend_key):
        raise HTTPException(status_code=501, detail=f"TTS backend '{backend_key}' not available")

    try:
        backend_cls = TTSRegistry.get(backend_key)
        backend = backend_cls()
        result = backend.synthesize(
            text,
            voice_id=voice_id,
            speed=speed,
            output_format=req.output_format,
        )
    except Exception as exc:
        logger.warning("Speech synthesis failed for backend %s: %s", backend_key, exc)
        raise HTTPException(status_code=503, detail=f"TTS synthesis failed: {exc}")

    media_type = "audio/mpeg" if result.format == "mp3" else "audio/wav"
    headers = {
        "X-Jarvis-Voice-Backend": backend_key,
        "X-Jarvis-Voice-Id": result.voice_id,
    }
    return Response(content=result.audio, media_type=media_type, headers=headers)


@voice_loop_router.get("/status")
async def voice_loop_status(request: Request):
    """Return the current HUD voice loop session state."""
    manager = getattr(request.app.state, "voice_loop", None)
    return _safe_voice_loop_status(manager)


@voice_loop_router.post("/start")
async def voice_loop_start(req: VoiceLoopStartRequest, request: Request):
    """Start an active HUD voice loop session."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    snapshot = manager.start(language_hints=req.language_hints)
    if not snapshot.get("backend_available"):
        raise HTTPException(
            status_code=503,
            detail=snapshot.get("last_error") or "Speech backend not available",
        )
    return snapshot


@voice_loop_router.post("/stop")
async def voice_loop_stop(request: Request):
    """Stop the active HUD voice loop session."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    return manager.stop()


@voice_loop_router.post("/state")
async def voice_loop_state(req: VoiceLoopUpdateRequest, request: Request):
    """Update the active HUD voice loop phase."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    return manager.update(
        phase=req.phase,
        transcript=req.transcript,
        error=req.error,
    )


@voice_loop_router.post("/interrupt")
async def voice_loop_interrupt(req: VoiceLoopInterruptRequest, request: Request):
    """Interrupt assistant speech and safely return the loop to listening."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    return manager.interrupt(reason=req.reason or "Interrupted by user")


@voice_loop_router.post("/ingest")
async def voice_loop_ingest(req: VoiceLoopIngestRequest, request: Request):
    """Evaluate a transcript against the configured wake phrase flow."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    return manager.ingest_transcript(req.transcript)


@voice_loop_router.post("/process-audio")
async def voice_loop_process_audio(request: Request):
    """Transcribe and evaluate a continuous audio chunk for the active voice loop."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")

    form = await request.form()
    audio_file = form.get("file")
    if audio_file is None:
        raise HTTPException(status_code=400, detail="Missing 'file' field")

    filename = getattr(audio_file, "filename", "chunk.webm")
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "webm"
    hints_raw = form.get("language_hints", "")
    language_hints = [h.strip() for h in str(hints_raw).split(",") if h.strip()]
    audio_bytes = await audio_file.read()

    try:
        return manager.process_audio(
            audio_bytes,
            format=ext,
            language_hints=language_hints or None,
        )
    except Exception as exc:
        logger.warning("Voice loop audio processing failed: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))


@agent_architecture_router.get("/status")
async def agent_architecture_status(request: Request):
    current_user = require_current_user_if_bootstrapped(request)
    owner_user_id = str(current_user.get("id") or "").strip() if current_user else None
    return build_architecture_status(request.app.state, owner_user_id=owner_user_id)


@agent_architecture_router.post("/ensure-core")
async def agent_architecture_ensure_core(request: Request):
    try:
        current_user = require_current_user_if_bootstrapped(request)
        owner_user_id = str(current_user.get("id") or "").strip() if current_user else None
        return ensure_core_team(request.app.state, owner_user_id=owner_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@agent_architecture_router.post("/handoff")
async def agent_architecture_handoff(req: AgentArchitectureHandoffRequest, request: Request):
    try:
        current_user = require_current_user_if_bootstrapped(request)
        owner_user_id = str(current_user.get("id") or "").strip() if current_user else None
        return create_role_handoff(
            request.app.state,
            brief=req.brief,
            source=req.source or "hud",
            metadata=req.metadata or {},
            owner_user_id=owner_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


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


@operator_memory_router.get("")
async def operator_memory_status(request: Request):
    manager = get_operator_memory_manager(request)
    return manager.snapshot()


@operator_memory_router.post("/context")
async def operator_memory_context(req: OperatorMemoryContextRequest, request: Request):
    manager = get_operator_memory_manager(request)
    limit = max(1, min(int(req.limit or 6), 10))
    layers = manager.layered_relevant_context(req.query, limit=limit)
    return {
        "query": req.query,
        "identity": layers.identity,
        "session_focus": layers.session_focus,
        "long_term": layers.long_term,
        "flattened": layers.flattened(limit=limit),
    }


@operator_memory_router.get("/analytics", response_model=OperatorMemoryAnalyticsResponse)
async def operator_memory_analytics(request: Request):
    manager = get_operator_memory_manager(request)
    return manager.analytics_summary()


@operator_memory_router.get("/commander-brief", response_model=OperatorCommanderBriefResponse)
async def operator_memory_commander_brief(request: Request):
    manager = get_operator_memory_manager(request)
    user = require_current_user_if_bootstrapped(request)
    awareness = build_architecture_status(
        request.app.state,
        owner_user_id=str(user["id"]).strip() if user is not None else None,
    ).get("awareness", {})
    analytics = manager.analytics_summary()
    profile = manager.snapshot().get("profile", {})
    return build_commander_brief(analytics=analytics, awareness=awareness, profile=profile)


@operator_memory_router.get("/coding-brief", response_model=OperatorCodingCommanderBriefResponse)
async def operator_memory_coding_brief(request: Request, objective: str = ""):
    manager = get_operator_memory_manager(request)
    profile = manager.snapshot().get("profile", {})
    registry = get_workspace_registry(request)
    if registry is None:
        raise HTTPException(status_code=503, detail="Workspace registry not configured")
    try:
        repo_summary = registry.summary()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    repo_memory = manager.get_coding_repo(str(repo_summary.get("root", "")).strip()) or {}
    return build_coding_commander_brief(
        repo_summary=repo_summary,
        repo_memory=repo_memory,
        profile=profile,
        objective=objective,
    )


@operator_memory_router.post("/review")
async def operator_memory_add_review_item(req: OperatorReviewItemRequest, request: Request):
    manager = get_operator_memory_manager(request)
    try:
        return manager.add_review_item(
            category=req.category or "quality",
            label=req.label or "Review item",
            summary=req.summary,
            detail=req.detail or "",
            source=req.source or "manual",
            status=req.status or "open",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/profile")
async def operator_memory_update_profile(req: OperatorProfileUpdateRequest, request: Request):
    manager = get_operator_memory_manager(request)
    return manager.update_profile(req.model_dump(exclude_none=True))


@operator_memory_router.post("/signal")
async def operator_memory_record_signal(req: OperatorSignalRequest, request: Request):
    manager = get_operator_memory_manager(request)
    try:
        return manager.record_signal(req.kind, req.contact or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/relationship")
async def operator_memory_update_relationship(
    req: OperatorRelationshipUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_relationship(req.contact, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/meeting")
async def operator_memory_update_meeting(
    req: OperatorMeetingUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_meeting(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/project")
async def operator_memory_update_project(
    req: OperatorProjectUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_project(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.get("/coding-repo")
async def operator_memory_get_coding_repo(repo_key: str, request: Request):
    manager = get_operator_memory_manager(request)
    memory = manager.get_coding_repo(repo_key)
    if memory is None:
        return {"repo_memory": None}
    return {"repo_memory": memory}


@operator_memory_router.post("/coding-repo")
async def operator_memory_update_coding_repo(
    req: OperatorCodingRepoUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_coding_repo(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/sales-account")
async def operator_memory_update_sales_account(
    req: OperatorSalesAccountUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_sales_account(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/sales-lead")
async def operator_memory_update_sales_lead(
    req: OperatorSalesLeadUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_sales_lead(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/sales-deal")
async def operator_memory_update_sales_deal(
    req: OperatorSalesDealUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_sales_deal(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/customer-account")
async def operator_memory_update_customer_account(
    req: OperatorCustomerAccountUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_customer_account(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/customer-interaction")
async def operator_memory_update_customer_interaction(
    req: OperatorCustomerInteractionUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.update_customer_interaction(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/visual")
async def operator_memory_add_visual_observation(
    req: OperatorVisualObservationRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.add_visual_observation(
            label=req.label,
            source=req.source or "screen",
            note=req.note,
            image_data_url=req.image_data_url or "",
            created_at=req.created_at or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/visual-insight")
async def operator_memory_add_visual_insight(
    req: OperatorVisualInsightRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.add_visual_insight(
            label=req.label,
            question=req.question,
            answer=req.answer,
            created_at=req.created_at or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/visual-brief")
async def operator_memory_add_visual_brief(
    req: OperatorVisualBriefRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.add_visual_brief(
            label=req.label,
            summary=req.summary,
            details=req.details or "",
            created_at=req.created_at or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/document-brief")
async def operator_memory_add_document_brief(
    req: OperatorDocumentBriefRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.add_document_brief(
            label=req.label,
            mode=req.mode,
            summary=req.summary,
            details=req.details or "",
            created_at=req.created_at or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/design-brief")
async def operator_memory_add_design_brief(
    req: OperatorDesignBriefRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        updated = manager.add_design_brief(
            label=req.label,
            archetype=req.archetype,
            summary=req.summary,
            details=req.details or "",
            scorecard=req.scorecard or [],
            created_at=req.created_at or "",
        )
        weakest = None
        if req.scorecard:
            sorted_items = sorted(
                [item for item in req.scorecard if isinstance(item, dict)],
                key=lambda item: float(item.get("score", 0)),
            )
            weakest = sorted_items[0] if sorted_items else None
        next_step = (
            f"Improve {str(weakest.get('label', 'the weakest HUD area')).strip().lower()} in the next HUD pass."
            if weakest
            else "Run the next HUD scorecard or design critique after the next layout pass."
        )
        result = (
            f"{str(weakest.get('label', 'HUD score')).strip()}: {weakest.get('score', 0)}/10. {str(weakest.get('note', '')).strip()}"
            if weakest
            else (req.summary or req.details or "").strip()
        )
        manager.update_mission(
            "design-mission",
            {
                "title": "HUD Design mission",
                "domain": "design",
                "status": "active",
                "phase": "plan" if weakest and float(weakest.get("score", 0)) < 8 else "verify",
                "summary": req.summary.strip() or "Design brief saved and ready for the next HUD refinement pass.",
                "next_step": next_step,
                "result": result,
                "retry_hint": "Re-score the HUD after the next visual refinement pass." if weakest else "",
                "result_data": {
                    "archetype": req.archetype,
                    "brief_label": req.label,
                    "scorecard_size": len(req.scorecard or []),
                    "weakest_area": str(weakest.get("label", "")).strip() if weakest else "",
                },
                "next_action": {
                    "kind": "prompt",
                    "content": req.details or req.summary,
                    "label": "Design Follow-up",
                },
                "updated_at": req.created_at or "",
            },
        )
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/fivem-brief")
async def operator_memory_add_fivem_brief(
    req: OperatorFivemBriefRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        updated = manager.add_fivem_brief(
            label=req.label,
            resource_key=req.resource_key,
            framework=req.framework,
            topology=req.topology,
            summary=req.summary,
            details=req.details or "",
            native_families=req.native_families or [],
            risk_tags=req.risk_tags or [],
            created_at=req.created_at or "",
        )
        manager.update_mission(
            "fivem-mission",
            {
                "title": "FiveM mission",
                "domain": "fivem",
                "status": "active",
                "phase": "verify" if req.framework.strip() in {"QBCore", "ESX", "ox_*"} else "plan",
                "summary": req.summary.strip() or "FiveM brief saved and ready for the next scripting pass.",
                "next_step": "Review framework boundaries, native usage, and event/state flow before the next patch.",
                "result": (req.summary or req.details or "").strip(),
                "retry_hint": "Re-run the most relevant FiveM audit after the next script change.",
                "result_data": {
                    "framework": req.framework,
                    "topology": req.topology,
                    "resource_key": req.resource_key,
                    "native_families": ", ".join(req.native_families or []),
                    "risk_tags": ", ".join(req.risk_tags or []),
                    "focus_area": "FiveM review",
                    "brief_label": req.label,
                },
                "next_action": {
                    "kind": "prompt",
                    "content": req.details or req.summary,
                    "label": "FiveM Follow-up",
                },
                "updated_at": req.created_at or "",
            },
        )
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/learning")
async def operator_memory_add_learning_experience(
    req: OperatorLearningExperienceRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        return manager.add_learning_experience(
            label=req.label,
            domain=req.domain,
            context_key=req.context_key or "",
            outcome_type=req.outcome_type or "lesson",
            summary=req.summary,
            lesson=req.lesson or "",
            reuse_hint=req.reuse_hint or "",
            tags=req.tags or [],
            confidence=req.confidence,
            created_at=req.created_at or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.get("/learning")
async def operator_memory_top_learning_experiences(
    request: Request,
    domain: str = "",
    context_key: str = "",
    limit: int = 5,
):
    manager = get_operator_memory_manager(request)
    return {
        "items": manager.top_learning_experiences(
            domain=domain,
            context_key=context_key,
            limit=max(1, min(limit, 10)),
        )
    }


@operator_memory_router.post("/learning/reuse")
async def operator_memory_mark_learning_reused(
    req: OperatorLearningReuseRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    updated = None
    try:
        for item_id in req.ids:
            if not str(item_id).strip():
                continue
            updated = manager.mark_learning_reused(
                str(item_id).strip(),
                reused_at=req.reused_at or "",
            )
        return updated or manager.snapshot()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/mission")
async def operator_memory_update_mission(
    req: OperatorMissionUpdateRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    try:
        updated = manager.update_mission(req.id, req.model_dump(exclude_none=True))
        updated_mission = next(
            (
                item
                for item in updated.get("missions", [])
                if str(item.get("id", "")).strip() == req.id.strip()
            ),
            None,
        )
        if isinstance(updated_mission, dict):
            status = str(updated_mission.get("status", "")).strip().lower()
            if status in {"blocked", "complete"}:
                _record_learning_from_mission_action(
                    manager,
                    updated_mission,
                    "complete" if status == "complete" else "retry",
                )
                updated = manager.snapshot()
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/mission/action")
async def operator_memory_act_on_mission(
    req: OperatorMissionActionRequest,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    snapshot = manager.snapshot()
    missions = snapshot.get("missions", []) if isinstance(snapshot, dict) else []
    current = next((item for item in missions if str(item.get("id", "")).strip() == req.id.strip()), None)
    if current is None:
        raise HTTPException(status_code=404, detail="Mission not found")

    action = req.action
    status_map = {
        "resume": ("active", "act"),
        "retry": ("blocked", "retry"),
        "complete": ("complete", "done"),
        "block": ("blocked", "retry"),
    }
    status, phase = status_map[action]
    default_summary = {
        "resume": f"Mission resumed: {current.get('title', 'mission')}.",
        "retry": f"Mission retry requested: {current.get('title', 'mission')}.",
        "complete": f"Mission completed: {current.get('title', 'mission')}.",
        "block": f"Mission blocked: {current.get('title', 'mission')}.",
    }
    followup = _mission_followup_payload(current, action)
    try:
        updated = manager.update_mission(
            req.id,
            {
                "title": str(current.get("title", "")).strip(),
                "domain": str(current.get("domain", "")).strip(),
                "status": status,
                "phase": phase,
                "summary": (req.summary or default_summary[action]).strip(),
                "next_step": str(current.get("next_step", "")).strip(),
                "result": (req.result or str(current.get("result", ""))).strip(),
                "retry_hint": (req.retry_hint or str(current.get("retry_hint", ""))).strip(),
                "result_data": dict(current.get("result_data") or {}) if isinstance(current.get("result_data"), dict) else {},
                "next_action": followup or (dict(current.get("next_action") or {}) if isinstance(current.get("next_action"), dict) else {}),
            },
        )
        updated_mission = next(
            (
                item
                for item in updated.get("missions", [])
                if str(item.get("id", "")).strip() == req.id.strip()
            ),
            current,
        )
        _record_learning_from_mission_action(
            manager,
            updated_mission,
            action,
            summary_override=(req.summary or default_summary[action]).strip(),
            result_override=(req.result or str(current.get("result", ""))).strip(),
            retry_hint_override=(req.retry_hint or str(current.get("retry_hint", ""))).strip(),
        )
        return {
            "memory": updated,
            "mission": updated_mission,
            "followup": _mission_followup_payload(updated_mission, action),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.get("/visual/{observation_id}/asset")
async def operator_memory_visual_asset(
    observation_id: str,
    request: Request,
):
    manager = get_operator_memory_manager(request)
    observation = manager.get_visual_observation(observation_id)
    if observation is None:
        raise HTTPException(status_code=404, detail="Visual observation not found")
    image_path = str(observation.get("image_path", "")).strip()
    if not image_path:
        raise HTTPException(status_code=404, detail="Visual observation has no stored asset")
    target = Path(image_path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Stored visual asset not found")
    return FileResponse(target)


@vision_router.post("/analyze")
async def vision_analyze(req: VisionAnalyzeRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision analysis requires OPENAI_API_KEY")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS visual analysis. Reply in English only. "
        "Analyze the provided image and produce a concise operator brief with these sections: "
        "Summary, Important Details, Risks, Recommended Next Action. "
        "If the user's note gives extra context, incorporate it."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nVisual label: {req.label.strip()}"

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyze this visual for my JARVIS HUD."},
                        {
                            "type": "image_url",
                            "image_url": {"url": req.image_data_url},
                        },
                    ],
                },
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision analysis failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()
    _update_visual_mission(
        request.app.state,
        phase="detect",
        status="active",
        summary=f"Visual analysis complete for {req.label or 'current visual'}.",
        next_step="Review the visual brief and decide whether to extract signals or ask a follow-up question.",
        result=content[:400],
        retry_hint="Re-run analysis with a clearer note or fresher capture if the summary feels incomplete.",
    )
    return {
        "content": content,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
    }


@vision_router.post("/analyze-multi")
async def vision_analyze_multi(req: VisionAnalyzeMultiRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision analysis requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for multi-screen analysis")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS multi-screen visual analysis. Reply in English only. "
        "Analyze the provided images as parts of one desktop setup. "
        "Produce a concise operator brief with these sections: "
        "Overall Summary, Screen-by-Screen Notes, Cross-Screen Risks, Recommended Next Action. "
        "Reference individual screens by their labels when useful. "
        "If the user's note gives extra context, incorporate it."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": "Analyze this full desktop setup for my JARVIS HUD."}
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append(
            {
                "type": "image_url",
                "image_url": {"url": image.get("image_data_url", "")},
            }
        )

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision analysis failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()
    _update_visual_mission(
        request.app.state,
        phase="detect",
        status="active",
        summary=f"Multi-screen visual analysis complete for {len(req.images)} screen(s).",
        next_step="Review cross-screen risks and extract the next action or signal set.",
        result=content[:400],
        retry_hint="Capture all relevant monitors again if the setup changed or important context is missing.",
    )
    return {
        "content": content,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
    }


@vision_router.post("/extract-text")
async def vision_extract_text(req: VisionExtractRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision text extraction requires OPENAI_API_KEY")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS OCR extraction. Reply in English only. "
        "Extract the visible text from the provided image as accurately as possible. "
        "Format the response with these sections: Summary, Extracted Text, Actionable Highlights. "
        "Preserve meaningful line breaks when useful. "
        "If the user's note gives extra context, use it to prioritize what to extract."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nVisual label: {req.label.strip()}"

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract the visible text from this visual for my JARVIS HUD."},
                        {"type": "image_url", "image_url": {"url": req.image_data_url}},
                    ],
                },
            ],
            temperature=0.1,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision text extraction failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()
    return {
        "content": content,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
    }


@vision_router.post("/extract-text-multi")
async def vision_extract_text_multi(req: VisionExtractMultiRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision text extraction requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for multi-screen text extraction")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS multi-screen OCR extraction. Reply in English only. "
        "Extract the visible text from the provided images as parts of one desktop setup. "
        "Format the response with these sections: Overall Summary, Screen-by-Screen Text, Actionable Highlights. "
        "Reference screens by label and preserve important line breaks when useful. "
        "If the user's note gives extra context, use it to prioritize extraction."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": "Extract the visible text from this desktop setup for my JARVIS HUD."}
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision text extraction failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()
    return {
        "content": content,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
    }


@vision_router.post("/suggest-actions")
async def vision_suggest_actions(req: VisionSuggestActionsRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision action suggestions require OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for vision action suggestions")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS visual action planning. Reply in JSON only. "
        "Analyze the provided image or screen set and return an object with one key: actions. "
        "actions must be an array of up to 3 objects with keys: title, detail, prompt, priority, desktop_intent. "
        "title should be short. detail should explain the observation. "
        "prompt should be a concrete next-step command-deck prompt in English. "
        "priority must be an integer from 1 to 100. "
        "desktop_intent should be a short, safe desktop-control command only when there is a clear next computer action; otherwise return an empty string."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": "Suggest the next operator actions for this JARVIS visual context."}
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision action suggestion failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    import json

    actions: list[dict[str, Any]] = []
    try:
        parsed = json.loads(content)
        raw_actions = parsed.get("actions", []) if isinstance(parsed, dict) else []
        if isinstance(raw_actions, list):
            for item in raw_actions[:3]:
                if not isinstance(item, dict):
                    continue
                actions.append(
                    {
                        "title": str(item.get("title", "")).strip() or "Visual Action",
                        "detail": str(item.get("detail", "")).strip(),
                        "prompt": str(item.get("prompt", "")).strip(),
                        "priority": int(item.get("priority", 50)),
                        "desktop_intent": str(item.get("desktop_intent", "")).strip(),
                    }
                )
    except Exception:
        if content:
            actions.append(
                {
                    "title": "Visual Follow-up",
                    "detail": "JARVIS generated a freeform follow-up suggestion.",
                    "prompt": content,
                    "priority": 50,
                    "desktop_intent": "",
                }
            )

    top_action = actions[0] if actions else None
    _update_visual_mission(
        request.app.state,
        phase="plan" if top_action else "detect",
        status="active" if top_action else "idle",
        summary=(
            f"Visual action suggestions ready for {req.label or 'current visual'}."
            if top_action
            else f"No strong visual action suggestions for {req.label or 'current visual'}."
        ),
        next_step=(top_action.get("title", "") if top_action else "Ask a focused visual question or extract signals."),
        result=(top_action.get("detail", "") if top_action else content[:400]),
        retry_hint="Try a clearer capture or add a stronger context note if the next action is still ambiguous.",
    )
    return {
        "actions": actions,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
    }


@vision_router.post("/ui-targets")
async def vision_extract_ui_targets(req: VisionUiTargetsRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision UI target extraction requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for UI target extraction")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS UI target extraction. Reply in JSON only. "
        "Analyze the provided image or screen set and return an object with one key: targets. "
        "targets must be an array of up to 5 objects with keys: label, detail, control_type, confidence, prompt, desktop_intent. "
        "label should be a short human-readable name for the likely control or interface target. "
        "detail should explain what the target appears to do or why it matters. "
        "control_type must be one of button, field, menu, panel, tab, link, alert, editor, window, or other. "
        "confidence must be an integer from 1 to 100. "
        "prompt should be a concrete next-step command-deck prompt in English. "
        "desktop_intent should be a short, safe desktop-control command only when there is a clear next computer action; otherwise return an empty string. "
        "Do not invent pixel coordinates or overstate certainty when the target is ambiguous."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": "Identify the most relevant UI targets in this JARVIS visual context."}
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.15,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision UI target extraction failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    targets: list[dict[str, Any]] = []
    try:
        parsed = json.loads(content)
        raw_targets = parsed.get("targets", []) if isinstance(parsed, dict) else []
        if isinstance(raw_targets, list):
            for item in raw_targets[:5]:
                if not isinstance(item, dict):
                    continue
                control_type = str(item.get("control_type", "other")).strip().lower() or "other"
                if control_type not in {"button", "field", "menu", "panel", "tab", "link", "alert", "editor", "window", "other"}:
                    control_type = "other"
                try:
                    confidence = max(1, min(int(item.get("confidence", 50)), 100))
                except Exception:
                    confidence = 50
                targets.append(
                    {
                        "label": str(item.get("label", "")).strip() or "UI Target",
                        "detail": str(item.get("detail", "")).strip(),
                        "control_type": control_type,
                        "confidence": confidence,
                        "prompt": str(item.get("prompt", "")).strip(),
                        "desktop_intent": str(item.get("desktop_intent", "")).strip(),
                    }
                )
    except Exception:
        if content:
            targets.append(
                {
                    "label": "Visual Target",
                    "detail": content,
                    "control_type": "other",
                    "confidence": 40,
                    "prompt": content,
                    "desktop_intent": "",
                }
            )

    return {
        "targets": targets,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
    }


@vision_router.post("/ui-action-plan")
async def vision_plan_ui_action(req: VisionUiActionPlanRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision UI planning requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for UI planning")
    if not req.target_label.strip():
        raise HTTPException(status_code=400, detail="target_label is required for UI planning")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS UI interaction planning. Reply in JSON only. "
        "Analyze the provided image or screen set and create a safe operator plan for the requested UI target. "
        "Return an object with keys: summary, steps, prompt, desktop_intent. "
        "summary should be one short sentence. "
        "steps must be an array of 2 to 5 concise English strings describing the safest likely interaction sequence. "
        "prompt should be a concrete next-step command-deck prompt in English. "
        "desktop_intent should be a short, safe desktop-control command only when there is a clear first action; otherwise return an empty string. "
        "Do not invent coordinates, hidden controls, or certainty you do not have."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    target_detail = (req.target_detail or "").strip()
    control_type = (req.control_type or "other").strip()
    user_content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Plan the safest likely interaction for this UI target.\n"
                f"Target: {req.target_label.strip()}\n"
                f"Control type: {control_type}\n"
                f"Detail: {target_detail or 'No extra detail provided.'}"
            ),
        }
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.15,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision UI planning failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    summary = ""
    steps: list[str] = []
    plan_prompt = ""
    desktop_intent = ""
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            summary = str(parsed.get("summary", "")).strip()
            raw_steps = parsed.get("steps", [])
            if isinstance(raw_steps, list):
                steps = [str(item).strip() for item in raw_steps[:5] if str(item).strip()]
            plan_prompt = str(parsed.get("prompt", "")).strip()
            desktop_intent = str(parsed.get("desktop_intent", "")).strip()
    except Exception:
        if content:
            summary = "JARVIS generated a freeform UI interaction plan."
            steps = [content]
            plan_prompt = content

    _update_visual_mission(
        request.app.state,
        phase="plan",
        status="active",
        summary=summary or f"UI interaction plan ready for {req.target_label.strip()}.",
        next_step=(steps[0] if steps else "Review the interaction plan before staging a desktop action."),
        result=(plan_prompt or "\n".join(steps))[:400],
        retry_hint="Verify the target again if the UI changed or the plan feels uncertain.",
    )
    return {
        "summary": summary or f"Interaction plan ready for {req.target_label.strip()}.",
        "steps": steps,
        "prompt": plan_prompt,
        "desktop_intent": desktop_intent,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "target_label": req.target_label.strip(),
        "screen_count": len(req.images),
    }


@vision_router.post("/ui-verify")
async def vision_verify_ui_target(req: VisionUiVerifyRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision UI verification requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for UI verification")
    if not req.target_label.strip():
        raise HTTPException(status_code=400, detail="target_label is required for UI verification")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS UI verification. Reply in JSON only. "
        "Analyze the provided image or screen set and verify how safe it is to interact with the requested UI target. "
        "Return an object with keys: summary, confidence, verification_checks, evidence, risk_level. "
        "confidence must be an integer from 1 to 100. "
        "verification_checks must be an array of 2 to 5 concise checks the operator should confirm before acting. "
        "evidence must be an array of 1 to 4 short observations explaining what in the image supports the target guess. "
        "risk_level must be low, medium, or high. "
        "Do not invent coordinates, hidden controls, or certainty you do not have."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Verify this UI target before action.\n"
                f"Target: {req.target_label.strip()}\n"
                f"Control type: {(req.control_type or 'other').strip()}\n"
                f"Detail: {(req.target_detail or '').strip() or 'No extra detail provided.'}\n"
                f"Planned desktop action: {(req.desktop_intent or '').strip() or 'None'}"
            ),
        }
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get('label') or f'Screen {index}').strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision UI verification failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    summary = ""
    confidence = 50
    verification_checks: list[str] = []
    evidence: list[str] = []
    risk_level = "medium"
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            summary = str(parsed.get("summary", "")).strip()
            try:
                confidence = max(1, min(int(parsed.get("confidence", 50)), 100))
            except Exception:
                confidence = 50
            raw_checks = parsed.get("verification_checks", [])
            if isinstance(raw_checks, list):
                verification_checks = [str(item).strip() for item in raw_checks[:5] if str(item).strip()]
            raw_evidence = parsed.get("evidence", [])
            if isinstance(raw_evidence, list):
                evidence = [str(item).strip() for item in raw_evidence[:4] if str(item).strip()]
            risk_value = str(parsed.get("risk_level", "medium")).strip().lower()
            if risk_value in {"low", "medium", "high"}:
                risk_level = risk_value
    except Exception:
        if content:
            summary = content

    return {
        "summary": summary or f"Verification ready for {req.target_label.strip()}.",
        "confidence": confidence,
        "verification_checks": verification_checks,
        "evidence": evidence,
        "risk_level": risk_level,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "target_label": req.target_label.strip(),
        "screen_count": len(req.images),
    }


@vision_router.post("/query")
async def vision_query(req: VisionQueryRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Visual question answering requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for visual question answering")
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required for visual question answering")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS visual question answering. Reply in English only. "
        "Answer the user's question about the provided image or screen set. "
        "Be concise but useful. If the answer is uncertain, say what is visible and what still needs confirmation. "
        "End with one short 'Next step' line when there is an obvious operator follow-up."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"
    history_lines: list[str] = []
    for item in req.history[:6]:
        previous_question = (item.get("question") or "").strip()
        previous_answer = (item.get("answer") or "").strip()
        if not previous_question or not previous_answer:
            continue
        history_lines.append(f"Q: {previous_question}\nA: {previous_answer}")
    if history_lines:
        prompt += "\n\nRecent visual conversation context:\n" + "\n\n".join(history_lines)

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": f"Question: {question}"},
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Visual question answering failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    _update_visual_mission(
        request.app.state,
        phase="verify",
        status="active",
        summary=f"Visual question answered for {req.label or 'current visual'}.",
        next_step="Use the answer to decide the next operator action or ask a tighter follow-up.",
        result=content[:400],
        retry_hint="Ask a narrower follow-up question if the answer is still uncertain.",
    )
    return {
        "answer": content,
        "question": question,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
        "history_used": len(history_lines),
    }


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


def _update_visual_mission(
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
    return operator_memory.update_mission(
        "visual-mission",
        {
            "title": "Visual Mission",
            "domain": "visual",
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
            },
            "next_action": {
                "kind": "prompt",
                "content": result or next_step or summary,
                "label": "Visual Follow-up",
            },
        },
    )


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


@workspace_router.get("/summary")
async def workspace_summary(request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    if registry is not None:
        try:
            return registry.summary(root)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    root_path = Path(root).expanduser().resolve() if root else Path(__file__).resolve().parents[3]

    def run_git(*args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=root_path,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return ""
        return result.stdout.strip()

    branch = run_git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
    changed_files = [line.strip() for line in run_git("status", "--short").splitlines() if line.strip()]
    top_level = sorted(
        item.name
        for item in root_path.iterdir()
        if item.is_dir() and not item.name.startswith(".")
    )[:12]
    return {
        "root": str(root_path),
        "branch": branch,
        "dirty": bool(changed_files),
        "changed_count": len(changed_files),
        "changed_files": changed_files[:8],
        "top_level": top_level,
        "remote_url": run_git("config", "--get", "remote.origin.url"),
        "active_root": str(root_path),
    }


@workspace_router.get("/repos")
async def workspace_repos(request: Request):
    registry = get_workspace_registry(request)
    return registry.list()


@workspace_router.post("/repos/register")
async def workspace_register_repo(req: WorkspaceRepoRegisterRequest, request: Request):
    registry = get_workspace_registry(request)
    workbench = get_workbench_manager(request)
    try:
        entry = registry.register(req.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if workbench is not None:
        workbench.set_default_working_dir(entry["root"])
    return registry.list()


@workspace_router.post("/repos/select")
async def workspace_select_repo(req: WorkspaceRepoSelectRequest, request: Request):
    registry = get_workspace_registry(request)
    workbench = get_workbench_manager(request)
    try:
        entry = registry.select(req.root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if workbench is not None:
        workbench.set_default_working_dir(entry["root"])
    return registry.list()


@workspace_router.get("/checks")
async def workspace_checks(request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    try:
        summary = registry.summary(root) if registry is not None else await workspace_summary(request, root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    repo_root = Path(summary["root"])
    checks: list[dict[str, str]] = []
    git_actions: list[dict[str, str]] = []
    summary_commands = summary.get("commands") or {}
    for kind in ("test", "lint", "typecheck", "build"):
        for command in summary_commands.get(kind, []):
            checks.append(
                {
                    "label": _workspace_command_label(command),
                    "command": command,
                    "kind": "typecheck" if kind == "build" else kind,
                }
            )

    changed_files = summary.get("changed_files") or []
    git_actions.append({"label": "Git Status", "command": "git status --short", "kind": "status"})
    if changed_files:
        git_actions.append({"label": "Stage All", "command": "git add -A", "kind": "stage"})
        git_actions.append({"label": "Diff Cached", "command": "git diff --cached", "kind": "diff"})

    return {
        "root": summary["root"],
        "checks": checks,
        "git_actions": git_actions,
        "repo_profile": {
            "languages": summary.get("languages") or [],
            "package_managers": summary.get("package_managers") or [],
            "conventions": summary.get("conventions") or [],
        },
    }


def _workspace_command_label(command: str) -> str:
    cleaned = str(command).strip()
    if not cleaned:
        return "Workspace Check"
    parts = cleaned.split()
    if cleaned.startswith("python -m "):
        return " ".join(parts[:3])
    if cleaned.startswith("npm run "):
        return " ".join(parts[:3])
    return " ".join(parts[:2]) if len(parts) >= 2 else cleaned


def _workspace_changed_paths(summary: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for raw_line in summary.get("changed_files") or []:
        line = str(raw_line).strip()
        if not line:
            continue
        parts = line.split(maxsplit=1)
        candidate = parts[-1].strip() if parts else ""
        if " -> " in candidate:
            candidate = candidate.split(" -> ", 1)[-1].strip()
        if candidate:
            paths.append(candidate)
    return paths


def _workspace_commit_type(paths: list[str]) -> str:
    lowered = [path.lower() for path in paths]
    if lowered and all(path.endswith((".md", ".txt", ".rst")) or path.startswith("docs/") for path in lowered):
        return "docs"
    if lowered and all("/test" in path or path.startswith("tests/") or path.endswith(("_test.py", ".spec.ts", ".test.ts", ".test.tsx")) for path in lowered):
        return "test"
    if lowered and all(
        path.startswith((".github/", "configs/", "deploy/"))
        or path.endswith((".json", ".toml", ".yaml", ".yml", ".ini"))
        for path in lowered
    ):
        return "chore"
    return "fix"


def _workspace_commit_scope(paths: list[str]) -> str:
    if not paths:
        return "workspace"
    first = paths[0].replace("\\", "/")
    parts = [part for part in first.split("/") if part]
    preferred = [part for part in parts if part not in {"src", "openjarvis", "frontend", "tests"}]
    if preferred:
        return preferred[0].replace("_", "-")
    stem = Path(first).stem.strip()
    return stem.replace("_", "-") or "workspace"


def _workspace_commit_subject(paths: list[str]) -> str:
    if not paths:
        return "update workspace"
    names = [Path(path.replace("\\", "/")).stem.replace("_", "-") for path in paths[:3]]
    names = [name for name in names if name]
    if not names:
        return "update workspace"
    if len(paths) == 1:
        return f"update {names[0]}"
    if len(paths) == 2 and len(names) >= 2:
        return f"update {names[0]} and {names[1]}"
    return f"update {names[0]} and related files"


def _generate_workspace_commit_message(summary: dict[str, Any]) -> str:
    paths = _workspace_changed_paths(summary)
    commit_type = _workspace_commit_type(paths)
    scope = _workspace_commit_scope(paths)
    subject = _workspace_commit_subject(paths)
    if scope:
        return f"{commit_type}({scope}): {subject}"
    return f"{commit_type}: {subject}"


@workspace_router.post("/git/prepare-stage")
async def workspace_prepare_stage(request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    try:
        summary = registry.summary(root) if registry is not None else await workspace_summary(request, root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "root": summary["root"],
        "command": "git add -A",
        "ready": bool(summary.get("changed_count")),
        "changed_count": summary.get("changed_count", 0),
        "staged_count": summary.get("staged_count", 0),
        "unstaged_count": summary.get("unstaged_count", 0),
        "message": (
            "Stage the current working tree changes."
            if summary.get("changed_count")
            else "No working tree changes detected."
        ),
    }


@workspace_router.post("/git/prepare-commit")
async def workspace_prepare_commit(req: WorkspaceGitActionRequest, request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    try:
        summary = registry.summary(root) if registry is not None else await workspace_summary(request, root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    message = (req.message or "").strip() or _generate_workspace_commit_message(summary)

    return {
        "root": summary["root"],
        "message": message,
        "command": f'git commit -m "{message.replace(chr(34), chr(39))}"',
        "ready": bool(summary.get("commit_ready")),
        "changed_count": summary.get("changed_count", 0),
        "staged_count": summary.get("staged_count", 0),
        "unstaged_count": summary.get("unstaged_count", 0),
        "branch": summary.get("branch", "unknown"),
    }


@workspace_router.get("/git/prepare-push")
async def workspace_prepare_push(request: Request, root: Optional[str] = None):
    registry = get_workspace_registry(request)
    try:
        summary = registry.summary(root) if registry is not None else await workspace_summary(request, root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    branch = summary.get("branch") or "HEAD"
    remote_url = str(summary.get("remote_url", "")).strip()
    has_upstream = bool(summary.get("has_upstream"))
    ahead_count = int(summary.get("ahead_count", 0))
    blocked_reason = ""
    if not remote_url:
        blocked_reason = "No remote origin is configured for this repository."
    elif not has_upstream:
        blocked_reason = "The current branch does not have an upstream tracking branch."
    elif summary.get("dirty"):
        blocked_reason = "The working tree is still dirty. Commit or hold local changes before pushing."
    elif ahead_count <= 0:
        blocked_reason = "No local commits are ahead of the upstream branch."
    return {
        "root": summary["root"],
        "command": f"git push origin {branch}",
        "ready": not blocked_reason,
        "blocked_reason": blocked_reason or None,
        "branch": branch,
        "ahead_count": ahead_count,
        "behind_count": int(summary.get("behind_count", 0)),
        "has_upstream": has_upstream,
    }


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


@shopify_router.get("/summary")
async def shopify_summary():
    connector = ShopifyConnector()
    if not connector.is_connected():
        raise HTTPException(status_code=400, detail="Shopify connector is not connected")
    try:
        return connector.store_summary()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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


# ---- Feedback routes ----

feedback_router = APIRouter(prefix="/v1/feedback", tags=["feedback"])


@feedback_router.post("")
async def submit_feedback(req: FeedbackScoreRequest, request: Request):
    """Submit feedback for a trace."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.traces.store import TraceStore

        db_path = DEFAULT_CONFIG_DIR / "traces.db"
        if not db_path.exists():
            raise HTTPException(status_code=404, detail="No trace database")

        store = TraceStore(db_path)
        updated = store.update_feedback(req.trace_id, req.score)
        store.close()

        if not updated:
            raise HTTPException(
                status_code=404, detail=f"Trace '{req.trace_id}' not found"
            )
        return {"status": "recorded", "trace_id": req.trace_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@feedback_router.get("/stats")
async def feedback_stats(request: Request):
    """Get feedback statistics."""
    return {"total": 0, "mean_score": 0.0}


# ---- Optimize routes ----

optimize_router = APIRouter(prefix="/v1/optimize", tags=["optimize"])


@optimize_router.get("/runs")
async def list_optimize_runs(request: Request):
    """List optimization runs."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.learning.optimize.store import OptimizationStore

        db_path = DEFAULT_CONFIG_DIR / "optimize.db"
        if not db_path.exists():
            return {"runs": []}

        store = OptimizationStore(db_path)
        runs = store.list_runs()
        store.close()
        return {"runs": runs}
    except Exception as exc:
        logger.warning("Failed to list optimization runs: %s", exc)
        return {"runs": []}


@optimize_router.get("/runs/{run_id}")
async def get_optimize_run(run_id: str, request: Request):
    """Get optimization run details."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.learning.optimize.store import OptimizationStore

        db_path = DEFAULT_CONFIG_DIR / "optimize.db"
        if not db_path.exists():
            return {"run_id": run_id, "status": "not_found"}

        store = OptimizationStore(db_path)
        run = store.get_run(run_id)
        store.close()

        if run is None:
            return {"run_id": run_id, "status": "not_found"}

        return {
            "run_id": run.run_id,
            "status": run.status,
            "benchmark": run.benchmark,
            "trials": len(run.trials),
            "best_trial_id": (run.best_trial.trial_id if run.best_trial else None),
        }
    except Exception as exc:
        logger.warning("Failed to get optimization run %s: %s", run_id, exc)
        return {"run_id": run_id, "status": "not_found"}


@optimize_router.post("/runs")
async def start_optimize_run(req: OptimizeRunRequest, request: Request):
    """Start a new optimization run."""
    return {"status": "started", "run_id": "placeholder"}


def include_all_routes(app) -> None:
    """Include all extended API routers in a FastAPI app."""
    app.include_router(agents_router)
    app.include_router(memory_router)
    app.include_router(traces_router)
    app.include_router(telemetry_router)
    app.include_router(skills_router)
    app.include_router(sessions_router)
    app.include_router(budget_router)
    app.include_router(metrics_router)
    app.include_router(websocket_router)
    app.include_router(learning_router)
    app.include_router(system_router)
    app.include_router(speech_router)
    app.include_router(voice_loop_router)
    app.include_router(agent_architecture_router)
    app.include_router(workbench_router)
    app.include_router(action_center_router)
    app.include_router(operator_memory_router)
    app.include_router(vision_router)
    app.include_router(automation_router)
    app.include_router(workspace_router)
    app.include_router(coding_router)
    app.include_router(shopify_router)
    app.include_router(feedback_router)
    app.include_router(optimize_router)

    # Agent Manager routes (if available)
    try:
        if hasattr(app.state, "agent_manager") and app.state.agent_manager:
            from openjarvis.server.agent_manager_routes import (  # noqa: PLC0415
                create_agent_manager_router,
            )

            routers = create_agent_manager_router(app.state.agent_manager)
            agents_r = routers[0]
            templates_r = routers[1]
            global_r = routers[2]
            tools_r = routers[3]
            app.include_router(agents_r)
            app.include_router(templates_r)
            app.include_router(global_r)
            app.include_router(tools_r)
    except ImportError:
        pass

    # WebSocket bridge for real-time agent events
    try:
        from openjarvis.core.events import get_event_bus
        from openjarvis.server.ws_bridge import create_ws_router

        ws_router = create_ws_router(get_event_bus())
        app.include_router(ws_router)
    except Exception:
        logger.debug("WebSocket bridge not available", exc_info=True)


__all__ = [
    "include_all_routes",
    "agents_router",
    "memory_router",
    "traces_router",
    "telemetry_router",
    "skills_router",
    "sessions_router",
    "budget_router",
    "metrics_router",
    "websocket_router",
    "learning_router",
    "speech_router",
    "voice_loop_router",
    "workbench_router",
    "action_center_router",
    "operator_memory_router",
    "automation_router",
    "workspace_router",
    "coding_router",
    "shopify_router",
    "feedback_router",
    "optimize_router",
]
