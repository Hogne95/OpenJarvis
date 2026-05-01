"""Extended API routes for agents, workflows, memory, traces, etc."""

from __future__ import annotations

import inspect
import json
import logging
import os
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
from openjarvis.server.auth import (
    get_action_center_manager,
    get_coding_workspace_manager,
    get_operator_memory_manager,
    get_workbench_manager,
    get_workspace_registry,
    require_current_user_if_bootstrapped,
    require_role_if_bootstrapped,
)
from openjarvis.server.routes_agent_architecture import agent_architecture_router
from openjarvis.server.routes_agents_memory import agents_router, memory_router
from openjarvis.server.routes_automation import automation_router
from openjarvis.server.routes_feedback_optimize import feedback_router, optimize_router
from openjarvis.server.routes_learning import learning_router
from openjarvis.server.routes_metrics import metrics_router
from openjarvis.server.routes_skills_sessions_budget import (
    budget_router,
    sessions_router,
    skills_router,
)
from openjarvis.server.routes_shopify import shopify_router
from openjarvis.server.routes_speech_voice import speech_router, system_router, voice_loop_router
from openjarvis.server.routes_traces_telemetry import traces_router, telemetry_router
from openjarvis.server.routes_websocket import websocket_router
from openjarvis.server.routes_workspace import workspace_router

logger = logging.getLogger(__name__)


def _knowledge_owner_user_id(request: Request) -> str:
    user = require_current_user_if_bootstrapped(request)
    if user is None:
        return ""
    return str(user.get("id") or "").strip()

# ---- Request/Response models ----


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


workbench_router = APIRouter(prefix="/v1/workbench", tags=["workbench"])
action_center_router = APIRouter(prefix="/v1/action-center", tags=["action-center"])
operator_memory_router = APIRouter(prefix="/v1/operator-memory", tags=["operator-memory"])
vision_router = APIRouter(prefix="/v1/vision", tags=["vision"])
coding_router = APIRouter(prefix="/v1/coding", tags=["coding"])


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
