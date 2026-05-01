"""Operator memory, commander brief, and mission routes."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from openjarvis.assistant import build_commander_brief
from openjarvis.assistant.commander import build_coding_commander_brief
from openjarvis.server.agent_architecture import build_architecture_status
from openjarvis.server.auth import (
    get_operator_memory_manager,
    get_workspace_registry,
    require_current_user_if_bootstrapped,
)


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


operator_memory_router = APIRouter(prefix="/v1/operator-memory", tags=["operator-memory"])


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
