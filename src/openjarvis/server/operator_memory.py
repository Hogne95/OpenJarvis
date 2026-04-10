"""Durable operator memory for learned preferences and relationship context."""

from __future__ import annotations

import base64
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openjarvis.core.config import DEFAULT_CONFIG_DIR
from openjarvis.assistant.memory_layers import AssistantMemoryLayers


@dataclass(slots=True)
class OperatorProfile:
    honorific: str = "sir"
    reply_tone: str = "clear and concise"
    verbosity_preference: str = "adaptive"
    technical_depth: str = "adaptive"
    decisiveness_preference: str = "recommend clearly"
    autonomy_preference: str = "balanced"
    personality_notes: str = ""
    priority_contacts: list[str] = field(default_factory=list)
    workday_start: str = "08:00"
    workday_end: str = "17:00"
    active_desktop_target: str = ""
    active_browser_target: str = ""


@dataclass(slots=True)
class OperatorSignals:
    reply_drafts: int = 0
    meetings_created: int = 0
    tasks_created: int = 0
    urgent_reviews: int = 0
    top_contacts: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ContactMemory:
    contact: str
    name: str = ""
    importance: str = "normal"
    relationship: str = ""
    notes: str = ""


@dataclass(slots=True)
class MeetingMemory:
    key: str
    title: str = ""
    importance: str = "normal"
    prep_style: str = ""
    notes: str = ""


@dataclass(slots=True)
class ProjectMemory:
    key: str
    title: str = ""
    focus: str = ""
    status: str = ""
    next_step: str = ""
    notes: str = ""


@dataclass(slots=True)
class SalesAccountMemory:
    key: str
    name: str = ""
    owner: str = ""
    segment: str = ""
    status: str = ""
    next_step: str = ""
    risk_level: str = ""
    last_interaction: str = ""
    notes: str = ""


@dataclass(slots=True)
class SalesLeadMemory:
    key: str
    name: str = ""
    company: str = ""
    owner: str = ""
    stage: str = ""
    source: str = ""
    next_step: str = ""
    risk_level: str = ""
    last_interaction: str = ""
    notes: str = ""


@dataclass(slots=True)
class SalesDealMemory:
    key: str
    title: str = ""
    account_key: str = ""
    owner: str = ""
    stage: str = ""
    value: str = ""
    close_target: str = ""
    next_step: str = ""
    risk_level: str = ""
    last_interaction: str = ""
    notes: str = ""


@dataclass(slots=True)
class CustomerAccountMemory:
    key: str
    name: str = ""
    owner: str = ""
    segment: str = ""
    health: str = ""
    sentiment: str = ""
    churn_risk: str = ""
    next_step: str = ""
    last_interaction: str = ""
    notes: str = ""


@dataclass(slots=True)
class CustomerInteractionMemory:
    key: str
    account_key: str = ""
    contact: str = ""
    channel: str = ""
    topic: str = ""
    sentiment: str = ""
    urgency: str = ""
    status: str = ""
    promised_follow_up: str = ""
    last_interaction: str = ""
    notes: str = ""


@dataclass(slots=True)
class ExplicitMemory:
    id: str
    content: str
    created_at: str = ""
    tags: list[str] = field(default_factory=list)


@dataclass(slots=True)
class VisualObservation:
    id: str
    label: str
    source: str = "screen"
    note: str = ""
    created_at: str = ""
    image_path: str = ""


@dataclass(slots=True)
class VisualInsight:
    id: str
    label: str
    question: str = ""
    answer: str = ""
    created_at: str = ""


@dataclass(slots=True)
class VisualBrief:
    id: str
    label: str
    summary: str = ""
    details: str = ""
    created_at: str = ""


@dataclass(slots=True)
class DocumentBrief:
    id: str
    label: str
    mode: str = ""
    summary: str = ""
    details: str = ""
    created_at: str = ""


@dataclass(slots=True)
class DesignBrief:
    id: str
    label: str
    archetype: str = ""
    summary: str = ""
    details: str = ""
    scorecard: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = ""


@dataclass(slots=True)
class FivemBrief:
    id: str
    label: str
    resource_key: str = ""
    framework: str = ""
    topology: str = ""
    summary: str = ""
    details: str = ""
    native_families: list[str] = field(default_factory=list)
    risk_tags: list[str] = field(default_factory=list)
    created_at: str = ""


@dataclass(slots=True)
class LearningExperience:
    id: str
    label: str
    domain: str = ""
    context_key: str = ""
    outcome_type: str = "lesson"
    summary: str = ""
    lesson: str = ""
    reuse_hint: str = ""
    tags: list[str] = field(default_factory=list)
    confidence: float = 0.6
    use_count: int = 1
    last_reused_at: str = ""
    created_at: str = ""


@dataclass(slots=True)
class MissionMemory:
    id: str
    title: str
    domain: str = ""
    status: str = "idle"
    phase: str = "detect"
    summary: str = ""
    next_step: str = ""
    result: str = ""
    retry_hint: str = ""
    result_data: dict[str, Any] = field(default_factory=dict)
    next_action: dict[str, Any] = field(default_factory=dict)
    updated_at: str = ""


@dataclass(slots=True)
class ReviewItem:
    id: str
    category: str = "quality"
    label: str = ""
    summary: str = ""
    detail: str = ""
    status: str = "open"
    source: str = "manual"
    created_at: str = ""


class OperatorMemory:
    """Simple JSON-backed operator memory for cross-session HUD personalization."""

    def __init__(self, path: str = "") -> None:
        self._path = Path(path) if path else DEFAULT_CONFIG_DIR / "operator_memory.json"
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._profile = OperatorProfile()
        self._signals = OperatorSignals()
        self._relationships: dict[str, ContactMemory] = {}
        self._meetings: dict[str, MeetingMemory] = {}
        self._projects: dict[str, ProjectMemory] = {}
        self._sales_accounts: dict[str, SalesAccountMemory] = {}
        self._sales_leads: dict[str, SalesLeadMemory] = {}
        self._sales_deals: dict[str, SalesDealMemory] = {}
        self._customer_accounts: dict[str, CustomerAccountMemory] = {}
        self._customer_interactions: dict[str, CustomerInteractionMemory] = {}
        self._explicit_memories: list[ExplicitMemory] = []
        self._visual_observations: list[VisualObservation] = []
        self._visual_insights: list[VisualInsight] = []
        self._visual_briefs: list[VisualBrief] = []
        self._document_briefs: list[DocumentBrief] = []
        self._design_briefs: list[DesignBrief] = []
        self._fivem_briefs: list[FivemBrief] = []
        self._learning_experiences: list[LearningExperience] = []
        self._missions: list[MissionMemory] = []
        self._review_items: list[ReviewItem] = []
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except Exception:
            return
        profile = data.get("profile", {})
        signals = data.get("signals", {})
        self._profile = OperatorProfile(
            honorific=str(profile.get("honorific", self._profile.honorific)),
            reply_tone=str(profile.get("reply_tone", self._profile.reply_tone)),
            verbosity_preference=str(profile.get("verbosity_preference", self._profile.verbosity_preference)),
            technical_depth=str(profile.get("technical_depth", self._profile.technical_depth)),
            decisiveness_preference=str(profile.get("decisiveness_preference", self._profile.decisiveness_preference)),
            autonomy_preference=str(profile.get("autonomy_preference", self._profile.autonomy_preference)),
            personality_notes=str(profile.get("personality_notes", self._profile.personality_notes)),
            priority_contacts=list(profile.get("priority_contacts", [])),
            workday_start=str(profile.get("workday_start", self._profile.workday_start)),
            workday_end=str(profile.get("workday_end", self._profile.workday_end)),
            active_desktop_target=str(profile.get("active_desktop_target", "")),
            active_browser_target=str(profile.get("active_browser_target", "")),
        )
        self._signals = OperatorSignals(
            reply_drafts=int(signals.get("reply_drafts", 0)),
            meetings_created=int(signals.get("meetings_created", 0)),
            tasks_created=int(signals.get("tasks_created", 0)),
            urgent_reviews=int(signals.get("urgent_reviews", 0)),
            top_contacts=list(signals.get("top_contacts", [])),
        )
        relationships = data.get("relationships", {})
        self._relationships = {
            key: ContactMemory(
                contact=key,
                name=str(value.get("name", "")),
                importance=str(value.get("importance", "normal")),
                relationship=str(value.get("relationship", "")),
                notes=str(value.get("notes", "")),
            )
            for key, value in relationships.items()
        }
        meetings = data.get("meetings", {})
        self._meetings = {
            key: MeetingMemory(
                key=key,
                title=str(value.get("title", "")),
                importance=str(value.get("importance", "normal")),
                prep_style=str(value.get("prep_style", "")),
                notes=str(value.get("notes", "")),
            )
            for key, value in meetings.items()
        }
        projects = data.get("projects", {})
        self._projects = {
            key: ProjectMemory(
                key=key,
                title=str(value.get("title", "")),
                focus=str(value.get("focus", "")),
                status=str(value.get("status", "")),
                next_step=str(value.get("next_step", "")),
                notes=str(value.get("notes", "")),
            )
            for key, value in projects.items()
        }
        sales_accounts = data.get("sales_accounts", {})
        self._sales_accounts = {
            key: SalesAccountMemory(
                key=key,
                name=str(value.get("name", "")),
                owner=str(value.get("owner", "")),
                segment=str(value.get("segment", "")),
                status=str(value.get("status", "")),
                next_step=str(value.get("next_step", "")),
                risk_level=str(value.get("risk_level", "")),
                last_interaction=str(value.get("last_interaction", "")),
                notes=str(value.get("notes", "")),
            )
            for key, value in sales_accounts.items()
        }
        sales_leads = data.get("sales_leads", {})
        self._sales_leads = {
            key: SalesLeadMemory(
                key=key,
                name=str(value.get("name", "")),
                company=str(value.get("company", "")),
                owner=str(value.get("owner", "")),
                stage=str(value.get("stage", "")),
                source=str(value.get("source", "")),
                next_step=str(value.get("next_step", "")),
                risk_level=str(value.get("risk_level", "")),
                last_interaction=str(value.get("last_interaction", "")),
                notes=str(value.get("notes", "")),
            )
            for key, value in sales_leads.items()
        }
        sales_deals = data.get("sales_deals", {})
        self._sales_deals = {
            key: SalesDealMemory(
                key=key,
                title=str(value.get("title", "")),
                account_key=str(value.get("account_key", "")),
                owner=str(value.get("owner", "")),
                stage=str(value.get("stage", "")),
                value=str(value.get("value", "")),
                close_target=str(value.get("close_target", "")),
                next_step=str(value.get("next_step", "")),
                risk_level=str(value.get("risk_level", "")),
                last_interaction=str(value.get("last_interaction", "")),
                notes=str(value.get("notes", "")),
            )
            for key, value in sales_deals.items()
        }
        customer_accounts = data.get("customer_accounts", {})
        self._customer_accounts = {
            key: CustomerAccountMemory(
                key=key,
                name=str(value.get("name", "")),
                owner=str(value.get("owner", "")),
                segment=str(value.get("segment", "")),
                health=str(value.get("health", "")),
                sentiment=str(value.get("sentiment", "")),
                churn_risk=str(value.get("churn_risk", "")),
                next_step=str(value.get("next_step", "")),
                last_interaction=str(value.get("last_interaction", "")),
                notes=str(value.get("notes", "")),
            )
            for key, value in customer_accounts.items()
        }
        customer_interactions = data.get("customer_interactions", {})
        self._customer_interactions = {
            key: CustomerInteractionMemory(
                key=key,
                account_key=str(value.get("account_key", "")),
                contact=str(value.get("contact", "")),
                channel=str(value.get("channel", "")),
                topic=str(value.get("topic", "")),
                sentiment=str(value.get("sentiment", "")),
                urgency=str(value.get("urgency", "")),
                status=str(value.get("status", "")),
                promised_follow_up=str(value.get("promised_follow_up", "")),
                last_interaction=str(value.get("last_interaction", "")),
                notes=str(value.get("notes", "")),
            )
            for key, value in customer_interactions.items()
        }
        explicit_memories = data.get("explicit_memories", [])
        self._explicit_memories = [
            ExplicitMemory(
                id=str(value.get("id", "")),
                content=str(value.get("content", "")),
                created_at=str(value.get("created_at", "")),
                tags=[str(tag).strip().lower() for tag in value.get("tags", []) if str(tag).strip()],
            )
            for value in explicit_memories
            if str(value.get("content", "")).strip()
        ]
        visual_observations = data.get("visual_observations", [])
        self._visual_observations = [
            VisualObservation(
                id=str(value.get("id", "")),
                label=str(value.get("label", "")),
                source=str(value.get("source", "screen")),
                note=str(value.get("note", "")),
                created_at=str(value.get("created_at", "")),
                image_path=str(value.get("image_path", "")),
            )
            for value in visual_observations
            if str(value.get("label", "")).strip()
        ]
        visual_insights = data.get("visual_insights", [])
        self._visual_insights = [
            VisualInsight(
                id=str(value.get("id", "")),
                label=str(value.get("label", "")),
                question=str(value.get("question", "")),
                answer=str(value.get("answer", "")),
                created_at=str(value.get("created_at", "")),
            )
            for value in visual_insights
            if str(value.get("question", "")).strip() or str(value.get("answer", "")).strip()
        ]
        visual_briefs = data.get("visual_briefs", [])
        self._visual_briefs = [
            VisualBrief(
                id=str(value.get("id", "")),
                label=str(value.get("label", "")),
                summary=str(value.get("summary", "")),
                details=str(value.get("details", "")),
                created_at=str(value.get("created_at", "")),
            )
            for value in visual_briefs
            if str(value.get("summary", "")).strip() or str(value.get("details", "")).strip()
        ]
        document_briefs = data.get("document_briefs", [])
        self._document_briefs = [
            DocumentBrief(
                id=str(value.get("id", "")),
                label=str(value.get("label", "")),
                mode=str(value.get("mode", "")),
                summary=str(value.get("summary", "")),
                details=str(value.get("details", "")),
                created_at=str(value.get("created_at", "")),
            )
            for value in document_briefs
            if str(value.get("summary", "")).strip() or str(value.get("details", "")).strip()
        ]
        design_briefs = data.get("design_briefs", [])
        self._design_briefs = [
            DesignBrief(
                id=str(value.get("id", "")),
                label=str(value.get("label", "")),
                archetype=str(value.get("archetype", "")),
                summary=str(value.get("summary", "")),
                details=str(value.get("details", "")),
                scorecard=list(value.get("scorecard", [])) if isinstance(value.get("scorecard", []), list) else [],
                created_at=str(value.get("created_at", "")),
            )
            for value in design_briefs
            if str(value.get("summary", "")).strip() or str(value.get("details", "")).strip()
        ]
        fivem_briefs = data.get("fivem_briefs", [])
        self._fivem_briefs = [
            FivemBrief(
                id=str(value.get("id", "")),
                label=str(value.get("label", "")),
                resource_key=str(value.get("resource_key", "")),
                framework=str(value.get("framework", "")),
                topology=str(value.get("topology", "")),
                summary=str(value.get("summary", "")),
                details=str(value.get("details", "")),
                native_families=list(value.get("native_families", [])) if isinstance(value.get("native_families", []), list) else [],
                risk_tags=list(value.get("risk_tags", [])) if isinstance(value.get("risk_tags", []), list) else [],
                created_at=str(value.get("created_at", "")),
            )
            for value in fivem_briefs
            if str(value.get("summary", "")).strip() or str(value.get("details", "")).strip()
        ]
        learning_experiences = data.get("learning_experiences", [])
        self._learning_experiences = [
            LearningExperience(
                id=str(value.get("id", "")),
                label=str(value.get("label", "")),
                domain=str(value.get("domain", "")),
                context_key=str(value.get("context_key", "")),
                outcome_type=str(value.get("outcome_type", "lesson")),
                summary=str(value.get("summary", "")),
                lesson=str(value.get("lesson", "")),
                reuse_hint=str(value.get("reuse_hint", "")),
                tags=[str(tag).strip().lower() for tag in value.get("tags", []) if str(tag).strip()],
                confidence=float(value.get("confidence", 0.6) or 0.6),
                use_count=max(1, int(value.get("use_count", 1) or 1)),
                last_reused_at=str(value.get("last_reused_at", "")),
                created_at=str(value.get("created_at", "")),
            )
            for value in learning_experiences
            if str(value.get("summary", "")).strip() or str(value.get("lesson", "")).strip()
        ]
        missions = data.get("missions", [])
        self._missions = [
            MissionMemory(
                id=str(value.get("id", "")),
                title=str(value.get("title", "")),
                domain=str(value.get("domain", "")),
                status=str(value.get("status", "idle")),
                phase=str(value.get("phase", "detect")),
                summary=str(value.get("summary", "")),
                next_step=str(value.get("next_step", "")),
                result=str(value.get("result", "")),
                retry_hint=str(value.get("retry_hint", "")),
                result_data=value.get("result_data", {}) if isinstance(value.get("result_data", {}), dict) else {},
                next_action=value.get("next_action", {}) if isinstance(value.get("next_action", {}), dict) else {},
                updated_at=str(value.get("updated_at", "")),
            )
            for value in missions
            if str(value.get("id", "")).strip() and str(value.get("title", "")).strip()
        ]
        review_items = data.get("review_items", [])
        self._review_items = [
            ReviewItem(
                id=str(value.get("id", "")),
                category=str(value.get("category", "quality")),
                label=str(value.get("label", "")),
                summary=str(value.get("summary", "")),
                detail=str(value.get("detail", "")),
                status=str(value.get("status", "open")),
                source=str(value.get("source", "manual")),
                created_at=str(value.get("created_at", "")),
            )
            for value in review_items
            if str(value.get("summary", "")).strip()
        ]

    def _save(self) -> None:
        payload = {
            "profile": asdict(self._profile),
            "signals": asdict(self._signals),
            "relationships": {key: asdict(value) for key, value in self._relationships.items()},
            "meetings": {key: asdict(value) for key, value in self._meetings.items()},
            "projects": {key: asdict(value) for key, value in self._projects.items()},
            "sales_accounts": {key: asdict(value) for key, value in self._sales_accounts.items()},
            "sales_leads": {key: asdict(value) for key, value in self._sales_leads.items()},
            "sales_deals": {key: asdict(value) for key, value in self._sales_deals.items()},
            "customer_accounts": {key: asdict(value) for key, value in self._customer_accounts.items()},
            "customer_interactions": {key: asdict(value) for key, value in self._customer_interactions.items()},
            "explicit_memories": [asdict(value) for value in self._explicit_memories],
            "visual_observations": [asdict(value) for value in self._visual_observations],
            "visual_insights": [asdict(value) for value in self._visual_insights],
            "visual_briefs": [asdict(value) for value in self._visual_briefs],
            "document_briefs": [asdict(value) for value in self._document_briefs],
            "design_briefs": [asdict(value) for value in self._design_briefs],
            "fivem_briefs": [asdict(value) for value in self._fivem_briefs],
            "learning_experiences": [asdict(value) for value in self._learning_experiences],
            "missions": [asdict(value) for value in self._missions],
            "review_items": [asdict(value) for value in self._review_items],
        }
        self._path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def snapshot(self) -> dict[str, Any]:
        return {
            "profile": asdict(self._profile),
            "signals": asdict(self._signals),
            "relationships": {key: asdict(value) for key, value in self._relationships.items()},
            "meetings": {key: asdict(value) for key, value in self._meetings.items()},
            "projects": {key: asdict(value) for key, value in self._projects.items()},
            "sales_accounts": {key: asdict(value) for key, value in self._sales_accounts.items()},
            "sales_leads": {key: asdict(value) for key, value in self._sales_leads.items()},
            "sales_deals": {key: asdict(value) for key, value in self._sales_deals.items()},
            "customer_accounts": {key: asdict(value) for key, value in self._customer_accounts.items()},
            "customer_interactions": {key: asdict(value) for key, value in self._customer_interactions.items()},
            "explicit_memories": [asdict(value) for value in self._explicit_memories],
            "visual_observations": [asdict(value) for value in self._visual_observations],
            "visual_insights": [asdict(value) for value in self._visual_insights],
            "visual_briefs": [asdict(value) for value in self._visual_briefs],
            "document_briefs": [asdict(value) for value in self._document_briefs],
            "design_briefs": [asdict(value) for value in self._design_briefs],
            "fivem_briefs": [asdict(value) for value in self._fivem_briefs],
            "learning_experiences": [asdict(value) for value in self._learning_experiences],
            "missions": [asdict(value) for value in self._missions],
            "review_items": [asdict(value) for value in self._review_items],
        }

    def update_profile(self, partial: dict[str, Any]) -> dict[str, Any]:
        if "honorific" in partial:
            self._profile.honorific = str(partial["honorific"]).strip() or self._profile.honorific
        if "reply_tone" in partial:
            self._profile.reply_tone = str(partial["reply_tone"]).strip() or self._profile.reply_tone
        if "verbosity_preference" in partial:
            self._profile.verbosity_preference = (
                str(partial["verbosity_preference"]).strip() or self._profile.verbosity_preference
            )
        if "technical_depth" in partial:
            self._profile.technical_depth = str(partial["technical_depth"]).strip() or self._profile.technical_depth
        if "decisiveness_preference" in partial:
            self._profile.decisiveness_preference = (
                str(partial["decisiveness_preference"]).strip() or self._profile.decisiveness_preference
            )
        if "autonomy_preference" in partial:
            self._profile.autonomy_preference = (
                str(partial["autonomy_preference"]).strip() or self._profile.autonomy_preference
            )
        if "personality_notes" in partial:
            self._profile.personality_notes = str(partial["personality_notes"]).strip()
        if "priority_contacts" in partial:
            raw = partial["priority_contacts"]
            if isinstance(raw, str):
                values = [item.strip().lower() for item in raw.split(",") if item.strip()]
            else:
                values = [str(item).strip().lower() for item in raw if str(item).strip()]
            self._profile.priority_contacts = values[:12]
        if "workday_start" in partial:
            self._profile.workday_start = str(partial["workday_start"]).strip() or self._profile.workday_start
        if "workday_end" in partial:
            self._profile.workday_end = str(partial["workday_end"]).strip() or self._profile.workday_end
        if "active_desktop_target" in partial:
            self._profile.active_desktop_target = str(partial["active_desktop_target"]).strip()
        if "active_browser_target" in partial:
            self._profile.active_browser_target = str(partial["active_browser_target"]).strip()
        self._save()
        return self.snapshot()

    def active_desktop_target(self) -> str:
        return self._profile.active_desktop_target

    def active_browser_target(self) -> str:
        return self._profile.active_browser_target

    def update_active_target(self, target: str, *, browser: bool = False) -> dict[str, Any]:
        cleaned = target.strip()
        self._profile.active_desktop_target = cleaned
        if browser:
            self._profile.active_browser_target = cleaned
        self._save()
        return self.snapshot()

    def update_relationship(self, contact: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_contact = contact.strip().lower()
        if not cleaned_contact:
            raise ValueError("Contact is required")
        current = self._relationships.get(cleaned_contact, ContactMemory(contact=cleaned_contact))
        if "name" in partial:
            current.name = str(partial["name"]).strip()
        if "importance" in partial:
            current.importance = str(partial["importance"]).strip() or current.importance
        if "relationship" in partial:
            current.relationship = str(partial["relationship"]).strip()
        if "notes" in partial:
            current.notes = str(partial["notes"]).strip()
        self._relationships[cleaned_contact] = current
        self._save()
        return self.snapshot()

    def update_meeting(self, key: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_key = key.strip().lower()
        if not cleaned_key:
            raise ValueError("Meeting key is required")
        current = self._meetings.get(cleaned_key, MeetingMemory(key=cleaned_key))
        if "title" in partial:
            current.title = str(partial["title"]).strip()
        if "importance" in partial:
            current.importance = str(partial["importance"]).strip() or current.importance
        if "prep_style" in partial:
            current.prep_style = str(partial["prep_style"]).strip()
        if "notes" in partial:
            current.notes = str(partial["notes"]).strip()
        self._meetings[cleaned_key] = current
        self._save()
        return self.snapshot()

    def update_project(self, key: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_key = key.strip().lower()
        if not cleaned_key:
            raise ValueError("Project key is required")
        current = self._projects.get(cleaned_key, ProjectMemory(key=cleaned_key))
        if "title" in partial:
            current.title = str(partial["title"]).strip()
        if "focus" in partial:
            current.focus = str(partial["focus"]).strip()
        if "status" in partial:
            current.status = str(partial["status"]).strip()
        if "next_step" in partial:
            current.next_step = str(partial["next_step"]).strip()
        if "notes" in partial:
            current.notes = str(partial["notes"]).strip()
        self._projects[cleaned_key] = current
        self._save()
        return self.snapshot()

    def update_sales_account(self, key: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_key = key.strip().lower()
        if not cleaned_key:
            raise ValueError("Sales account key is required")
        current = self._sales_accounts.get(cleaned_key, SalesAccountMemory(key=cleaned_key))
        if "name" in partial:
            current.name = str(partial["name"]).strip()
        if "owner" in partial:
            current.owner = str(partial["owner"]).strip()
        if "segment" in partial:
            current.segment = str(partial["segment"]).strip()
        if "status" in partial:
            current.status = str(partial["status"]).strip()
        if "next_step" in partial:
            current.next_step = str(partial["next_step"]).strip()
        if "risk_level" in partial:
            current.risk_level = str(partial["risk_level"]).strip()
        if "last_interaction" in partial:
            current.last_interaction = str(partial["last_interaction"]).strip()
        if "notes" in partial:
            current.notes = str(partial["notes"]).strip()
        self._sales_accounts[cleaned_key] = current
        self._save()
        return self.snapshot()

    def update_sales_lead(self, key: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_key = key.strip().lower()
        if not cleaned_key:
            raise ValueError("Sales lead key is required")
        current = self._sales_leads.get(cleaned_key, SalesLeadMemory(key=cleaned_key))
        if "name" in partial:
            current.name = str(partial["name"]).strip()
        if "company" in partial:
            current.company = str(partial["company"]).strip()
        if "owner" in partial:
            current.owner = str(partial["owner"]).strip()
        if "stage" in partial:
            current.stage = str(partial["stage"]).strip()
        if "source" in partial:
            current.source = str(partial["source"]).strip()
        if "next_step" in partial:
            current.next_step = str(partial["next_step"]).strip()
        if "risk_level" in partial:
            current.risk_level = str(partial["risk_level"]).strip()
        if "last_interaction" in partial:
            current.last_interaction = str(partial["last_interaction"]).strip()
        if "notes" in partial:
            current.notes = str(partial["notes"]).strip()
        self._sales_leads[cleaned_key] = current
        self._save()
        return self.snapshot()

    def update_sales_deal(self, key: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_key = key.strip().lower()
        if not cleaned_key:
            raise ValueError("Sales deal key is required")
        current = self._sales_deals.get(cleaned_key, SalesDealMemory(key=cleaned_key))
        if "title" in partial:
            current.title = str(partial["title"]).strip()
        if "account_key" in partial:
            current.account_key = str(partial["account_key"]).strip().lower()
        if "owner" in partial:
            current.owner = str(partial["owner"]).strip()
        if "stage" in partial:
            current.stage = str(partial["stage"]).strip()
        if "value" in partial:
            current.value = str(partial["value"]).strip()
        if "close_target" in partial:
            current.close_target = str(partial["close_target"]).strip()
        if "next_step" in partial:
            current.next_step = str(partial["next_step"]).strip()
        if "risk_level" in partial:
            current.risk_level = str(partial["risk_level"]).strip()
        if "last_interaction" in partial:
            current.last_interaction = str(partial["last_interaction"]).strip()
        if "notes" in partial:
            current.notes = str(partial["notes"]).strip()
        self._sales_deals[cleaned_key] = current
        self._save()
        return self.snapshot()

    def update_customer_account(self, key: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_key = key.strip().lower()
        if not cleaned_key:
            raise ValueError("Customer account key is required")
        current = self._customer_accounts.get(cleaned_key, CustomerAccountMemory(key=cleaned_key))
        if "name" in partial:
            current.name = str(partial["name"]).strip()
        if "owner" in partial:
            current.owner = str(partial["owner"]).strip()
        if "segment" in partial:
            current.segment = str(partial["segment"]).strip()
        if "health" in partial:
            current.health = str(partial["health"]).strip()
        if "sentiment" in partial:
            current.sentiment = str(partial["sentiment"]).strip()
        if "churn_risk" in partial:
            current.churn_risk = str(partial["churn_risk"]).strip()
        if "next_step" in partial:
            current.next_step = str(partial["next_step"]).strip()
        if "last_interaction" in partial:
            current.last_interaction = str(partial["last_interaction"]).strip()
        if "notes" in partial:
            current.notes = str(partial["notes"]).strip()
        self._customer_accounts[cleaned_key] = current
        self._save()
        return self.snapshot()

    def update_customer_interaction(self, key: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_key = key.strip().lower()
        if not cleaned_key:
            raise ValueError("Customer interaction key is required")
        current = self._customer_interactions.get(cleaned_key, CustomerInteractionMemory(key=cleaned_key))
        if "account_key" in partial:
            current.account_key = str(partial["account_key"]).strip().lower()
        if "contact" in partial:
            current.contact = str(partial["contact"]).strip()
        if "channel" in partial:
            current.channel = str(partial["channel"]).strip()
        if "topic" in partial:
            current.topic = str(partial["topic"]).strip()
        if "sentiment" in partial:
            current.sentiment = str(partial["sentiment"]).strip()
        if "urgency" in partial:
            current.urgency = str(partial["urgency"]).strip()
        if "status" in partial:
            current.status = str(partial["status"]).strip()
        if "promised_follow_up" in partial:
            current.promised_follow_up = str(partial["promised_follow_up"]).strip()
        if "last_interaction" in partial:
            current.last_interaction = str(partial["last_interaction"]).strip()
        if "notes" in partial:
            current.notes = str(partial["notes"]).strip()
        self._customer_interactions[cleaned_key] = current
        self._save()
        return self.snapshot()

    def record_signal(self, kind: str, contact: str = "") -> dict[str, Any]:
        normalized = kind.strip().lower()
        if normalized == "reply":
            self._signals.reply_drafts += 1
        elif normalized == "meeting":
            self._signals.meetings_created += 1
        elif normalized == "task":
            self._signals.tasks_created += 1
        elif normalized == "urgent":
            self._signals.urgent_reviews += 1
        else:
            raise ValueError("Unsupported operator signal")

        cleaned_contact = contact.strip().lower()
        if cleaned_contact:
            merged = [cleaned_contact, *[item for item in self._signals.top_contacts if item != cleaned_contact]]
            self._signals.top_contacts = merged[:12]

        self._save()
        return self.snapshot()

    def add_explicit_memory(self, content: str, *, tags: list[str] | None = None, created_at: str = "") -> dict[str, Any]:
        cleaned = content.strip()
        if not cleaned:
            raise ValueError("Memory content is required")
        memory_id = cleaned.lower()
        self._explicit_memories = [
            item for item in self._explicit_memories if item.id != memory_id and item.content.strip().lower() != cleaned.lower()
        ]
        self._explicit_memories.insert(
            0,
            ExplicitMemory(
                id=memory_id,
                content=cleaned,
                created_at=created_at,
                tags=[tag.strip().lower() for tag in (tags or []) if tag.strip()],
            ),
        )
        self._explicit_memories = self._explicit_memories[:100]
        self._save()
        return self.snapshot()

    def search_explicit_memories(self, query: str, *, limit: int = 5) -> list[dict[str, Any]]:
        cleaned = query.strip().lower()
        items = self._explicit_memories
        if not cleaned:
            items = items[:limit]
        else:
            ranked = []
            for item in items:
                haystack = f"{item.content} {' '.join(item.tags)}".lower()
                if cleaned in haystack:
                    score = 1.0
                else:
                    overlap = len(set(cleaned.split()) & set(haystack.split()))
                    score = overlap / max(len(set(cleaned.split())), 1)
                if score > 0:
                    ranked.append((score, item))
            items = [item for _, item in sorted(ranked, key=lambda pair: pair[0], reverse=True)[:limit]]
        return [asdict(item) for item in items]

    def relevant_context(self, query: str, *, limit: int = 6) -> list[dict[str, Any]]:
        """Return a compact set of high-signal memories relevant to *query*."""

        return self.layered_relevant_context(query, limit=limit).flattened(limit=limit)

    def layered_relevant_context(self, query: str, *, limit: int = 6) -> AssistantMemoryLayers:
        """Return relevant memory separated into identity, session-focus, and long-term layers."""

        cleaned = " ".join((query or "").strip().lower().split())
        if not cleaned:
            return AssistantMemoryLayers()

        tokens = {token for token in cleaned.replace("/", " ").replace("-", " ").split() if len(token) >= 3}

        def _score_text(*parts: str) -> float:
            haystack = " ".join(part for part in parts if part).lower()
            if not haystack:
                return 0.0
            score = 0.0
            for token in tokens:
                if token in haystack:
                    score += 1.0
            return score

        identity_candidates: list[tuple[float, dict[str, Any]]] = []
        session_candidates: list[tuple[float, dict[str, Any]]] = []
        long_term_candidates: list[tuple[float, dict[str, Any]]] = []

        profile_score = 0.0
        if any(word in cleaned for word in ("reply", "tone", "draft", "email", "message", "write")):
            profile_score += 1.5
        if any(word in cleaned for word in ("schedule", "calendar", "meeting", "workday", "today")):
            profile_score += 1.25
        if any(word in cleaned for word in ("desktop", "browser", "window", "tab", "app")):
            profile_score += 1.0
        if any(word in cleaned for word in ("should", "recommend", "plan", "focus", "next")):
            profile_score += 0.7
        profile_score += _score_text(
            self._profile.reply_tone,
            self._profile.verbosity_preference,
            self._profile.technical_depth,
            self._profile.decisiveness_preference,
            self._profile.autonomy_preference,
            self._profile.personality_notes,
            " ".join(self._profile.priority_contacts),
            self._profile.workday_start,
            self._profile.workday_end,
            self._profile.active_desktop_target,
            self._profile.active_browser_target,
        ) * 0.4
        if profile_score > 0:
            identity_candidates.append(
                (
                    profile_score,
                    {
                        "label": "Known preferences",
                        "detail": (
                            f"Reply tone: {self._profile.reply_tone}; "
                            f"verbosity: {self._profile.verbosity_preference}; "
                            f"technical depth: {self._profile.technical_depth}; "
                            f"decision style: {self._profile.decisiveness_preference}; "
                            f"autonomy: {self._profile.autonomy_preference}; "
                            f"priority contacts: {', '.join(self._profile.priority_contacts) or 'none'}; "
                            f"workday: {self._profile.workday_start}-{self._profile.workday_end}"
                        ),
                        "reason": "user preference profile",
                    },
                )
            )

        for memory in self.search_explicit_memories(cleaned, limit=limit):
            score = 1.4 + _score_text(memory.get("content", ""), " ".join(memory.get("tags", []))) * 0.5
            long_term_candidates.append(
                (
                    score,
                    {
                        "label": "Explicit memory",
                        "detail": str(memory.get("content", "")).strip(),
                        "reason": "saved memory match",
                    },
                )
            )

        for item in self._learning_experiences:
            score = _score_text(item.label, item.domain, item.context_key, item.summary, item.lesson, item.reuse_hint, " ".join(item.tags))
            if score <= 0:
                continue
            score += min(max(item.confidence, 0.0), 1.0)
            if item.use_count > 1:
                score += 0.4
            long_term_candidates.append(
                (
                    score,
                    {
                        "label": f"Past lesson: {item.label}",
                        "detail": item.lesson or item.summary,
                        "reason": "repeated pattern or prior decision",
                    },
                )
            )

        for mission in self._missions:
            if mission.status.strip().lower() in {"done", "completed", "archived"}:
                continue
            score = _score_text(mission.title, mission.domain, mission.summary, mission.next_step, mission.result, mission.retry_hint)
            if score <= 0 and not any(word in cleaned for word in ("next", "priority", "unfinished", "stuck", "pending", "plan")):
                continue
            score += 0.9
            session_candidates.append(
                (
                    score,
                    {
                        "label": f"Open mission: {mission.title}",
                        "detail": mission.next_step or mission.summary or mission.result,
                        "reason": "unfinished work",
                    },
                )
            )

        for project in self._projects.values():
            score = _score_text(project.key, project.title, project.focus, project.status, project.next_step, project.notes)
            if score <= 0:
                continue
            session_candidates.append(
                (
                    score + 0.6,
                    {
                        "label": f"Project context: {project.title or project.key}",
                        "detail": project.next_step or project.focus or project.notes or project.status,
                        "reason": "active project context",
                    },
                )
            )

        for relationship in self._relationships.values():
            score = _score_text(relationship.contact, relationship.name, relationship.relationship, relationship.notes, relationship.importance)
            if score <= 0:
                continue
            long_term_candidates.append(
                (
                    score + 0.5,
                    {
                        "label": f"Relationship context: {relationship.name or relationship.contact}",
                        "detail": relationship.notes or relationship.relationship or relationship.importance,
                        "reason": "known contact context",
                    },
                )
            )

        def _rank(items: list[tuple[float, dict[str, Any]]], *, item_limit: int) -> list[dict[str, Any]]:
            seen: set[tuple[str, str]] = set()
            ranked: list[dict[str, Any]] = []
            for _score, item in sorted(items, key=lambda pair: pair[0], reverse=True):
                key = (str(item.get("label", "")), str(item.get("detail", "")))
                if key in seen:
                    continue
                seen.add(key)
                ranked.append(item)
                if len(ranked) >= max(1, item_limit):
                    break
            return ranked

        layer_limit = max(1, limit)
        identity = _rank(identity_candidates, item_limit=min(2, layer_limit))
        session_focus = _rank(session_candidates, item_limit=min(3, layer_limit))
        remaining = max(1, layer_limit - len(identity) - len(session_focus))
        long_term = _rank(long_term_candidates, item_limit=remaining)
        return AssistantMemoryLayers(
            identity=identity,
            session_focus=session_focus,
            long_term=long_term,
        )

    def delete_explicit_memory(self, query: str) -> dict[str, Any]:
        cleaned = query.strip().lower()
        if not cleaned:
            raise ValueError("Memory query is required")
        original_len = len(self._explicit_memories)
        self._explicit_memories = [
            item
            for item in self._explicit_memories
            if cleaned not in item.content.lower() and cleaned != item.id
        ]
        deleted = original_len - len(self._explicit_memories)
        self._save()
        return {"deleted": deleted, "snapshot": self.snapshot()}

    def get_visual_observation(self, observation_id: str) -> dict[str, Any] | None:
        cleaned = observation_id.strip()
        if not cleaned:
            return None
        for item in self._visual_observations:
            if item.id == cleaned:
                return asdict(item)
        return None

    def add_visual_observation(
        self,
        *,
        label: str,
        source: str,
        note: str,
        image_data_url: str = "",
        created_at: str = "",
    ) -> dict[str, Any]:
        cleaned_label = label.strip() or "Visual Context"
        cleaned_note = note.strip()
        if not cleaned_note:
            raise ValueError("Visual note is required")
        observation_id = f"{source.strip().lower() or 'visual'}-{(created_at or cleaned_label).strip().lower().replace(' ', '-')}"
        image_path = ""
        if image_data_url.strip().startswith("data:image/"):
            image_path = self._persist_visual_asset(observation_id, image_data_url.strip())
        self._visual_observations = [item for item in self._visual_observations if item.id != observation_id]
        self._visual_observations.insert(
            0,
            VisualObservation(
                id=observation_id,
                label=cleaned_label,
                source=source.strip().lower() or "visual",
                note=cleaned_note,
                created_at=created_at,
                image_path=image_path,
            ),
        )
        self._visual_observations = self._visual_observations[:24]
        self._save()
        return self.snapshot()

    def add_visual_insight(
        self,
        *,
        label: str,
        question: str,
        answer: str,
        created_at: str = "",
    ) -> dict[str, Any]:
        cleaned_label = label.strip() or "Visual Context"
        cleaned_question = question.strip()
        cleaned_answer = answer.strip()
        if not cleaned_question:
            raise ValueError("Visual question is required")
        if not cleaned_answer:
            raise ValueError("Visual answer is required")
        stamp = (created_at or cleaned_question).strip().lower().replace(" ", "-")
        insight_id = f"visual-insight-{stamp}"
        self._visual_insights = [item for item in self._visual_insights if item.id != insight_id]
        self._visual_insights.insert(
            0,
            VisualInsight(
                id=insight_id,
                label=cleaned_label,
                question=cleaned_question,
                answer=cleaned_answer,
                created_at=created_at,
            ),
        )
        self._visual_insights = self._visual_insights[:36]
        self._save()
        return self.snapshot()

    def add_visual_brief(
        self,
        *,
        label: str,
        summary: str,
        details: str,
        created_at: str = "",
    ) -> dict[str, Any]:
        cleaned_label = label.strip() or "Visual Brief"
        cleaned_summary = summary.strip()
        cleaned_details = details.strip()
        if not cleaned_summary and not cleaned_details:
            raise ValueError("Visual brief content is required")
        stamp = (created_at or cleaned_label).strip().lower().replace(" ", "-")
        brief_id = f"visual-brief-{stamp}"
        self._visual_briefs = [item for item in self._visual_briefs if item.id != brief_id]
        self._visual_briefs.insert(
            0,
            VisualBrief(
                id=brief_id,
                label=cleaned_label,
                summary=cleaned_summary,
                details=cleaned_details,
                created_at=created_at,
            ),
        )
        self._visual_briefs = self._visual_briefs[:24]
        self._save()
        return self.snapshot()

    def add_document_brief(
        self,
        *,
        label: str,
        mode: str,
        summary: str,
        details: str,
        created_at: str = "",
    ) -> dict[str, Any]:
        cleaned_label = label.strip() or "Document Brief"
        cleaned_mode = mode.strip().lower()
        cleaned_summary = summary.strip()
        cleaned_details = details.strip()
        if not cleaned_summary and not cleaned_details:
            raise ValueError("Document brief content is required")
        stamp = (created_at or f"{cleaned_label}-{cleaned_mode or 'document'}").strip().lower().replace(" ", "-")
        brief_id = f"document-brief-{stamp}"
        self._document_briefs = [item for item in self._document_briefs if item.id != brief_id]
        self._document_briefs.insert(
            0,
            DocumentBrief(
                id=brief_id,
                label=cleaned_label,
                mode=cleaned_mode,
                summary=cleaned_summary,
                details=cleaned_details,
                created_at=created_at,
            ),
        )
        self._document_briefs = self._document_briefs[:24]
        self._save()
        return self.snapshot()

    def add_design_brief(
        self,
        *,
        label: str,
        archetype: str,
        summary: str,
        details: str,
        scorecard: list[dict[str, Any]] | None = None,
        created_at: str = "",
    ) -> dict[str, Any]:
        cleaned_label = label.strip() or "Design Brief"
        cleaned_archetype = archetype.strip()
        cleaned_summary = summary.strip()
        cleaned_details = details.strip()
        if not cleaned_summary and not cleaned_details:
            raise ValueError("Design brief content is required")
        stamp = (created_at or f"{cleaned_label}-{cleaned_archetype or 'design'}").strip().lower().replace(" ", "-")
        brief_id = f"design-brief-{stamp}"
        self._design_briefs = [item for item in self._design_briefs if item.id != brief_id]
        self._design_briefs.insert(
            0,
            DesignBrief(
                id=brief_id,
                label=cleaned_label,
                archetype=cleaned_archetype,
                summary=cleaned_summary,
                details=cleaned_details,
                scorecard=list(scorecard or []),
                created_at=created_at,
            ),
        )
        self._design_briefs = self._design_briefs[:24]
        self._save()
        return self.snapshot()

    def add_fivem_brief(
        self,
        *,
        label: str,
        resource_key: str,
        framework: str,
        topology: str,
        summary: str,
        details: str,
        native_families: list[str] | None = None,
        risk_tags: list[str] | None = None,
        created_at: str = "",
    ) -> dict[str, Any]:
        cleaned_label = label.strip() or "FiveM Brief"
        cleaned_resource_key = resource_key.strip()
        cleaned_framework = framework.strip()
        cleaned_topology = topology.strip()
        cleaned_summary = summary.strip()
        cleaned_details = details.strip()
        if not cleaned_summary and not cleaned_details:
            raise ValueError("FiveM brief content is required")
        stamp = (created_at or f"{cleaned_label}-{cleaned_framework or 'fivem'}").strip().lower().replace(" ", "-")
        brief_id = f"fivem-brief-{stamp}"
        self._fivem_briefs = [item for item in self._fivem_briefs if item.id != brief_id]
        self._fivem_briefs.insert(
            0,
            FivemBrief(
                id=brief_id,
                label=cleaned_label,
                resource_key=cleaned_resource_key,
                framework=cleaned_framework,
                topology=cleaned_topology,
                summary=cleaned_summary,
                details=cleaned_details,
                native_families=list(native_families or []),
                risk_tags=list(risk_tags or []),
                created_at=created_at,
            ),
        )
        self._fivem_briefs = self._fivem_briefs[:24]
        self._save()
        return self.snapshot()

    def add_learning_experience(
        self,
        *,
        label: str,
        domain: str,
        context_key: str = "",
        outcome_type: str = "lesson",
        summary: str,
        lesson: str = "",
        reuse_hint: str = "",
        tags: list[str] | None = None,
        confidence: float | None = None,
        created_at: str = "",
    ) -> dict[str, Any]:
        cleaned_label = label.strip() or "Learning"
        cleaned_domain = domain.strip().lower() or "general"
        cleaned_context_key = context_key.strip()
        cleaned_summary = summary.strip()
        cleaned_lesson = lesson.strip()
        cleaned_reuse_hint = reuse_hint.strip()
        if not cleaned_summary and not cleaned_lesson:
            raise ValueError("Learning summary or lesson is required")
        normalized_outcome = outcome_type.strip().lower() or "lesson"
        inferred_confidence = confidence
        if inferred_confidence is None:
            inferred_confidence = 0.72 if normalized_outcome == "mistake" else 0.66 if normalized_outcome == "success" else 0.58
        clamped_confidence = max(0.05, min(1.0, float(inferred_confidence)))
        stamp = (created_at or f"{cleaned_domain}-{cleaned_label}").strip().lower().replace(" ", "-")
        experience_id = f"learning-{stamp}"
        duplicate = next(
            (
                item
                for item in self._learning_experiences
                if item.id == experience_id
                or (
                    item.domain == cleaned_domain
                    and item.context_key == cleaned_context_key
                    and item.outcome_type == normalized_outcome
                    and item.summary == cleaned_summary
                    and item.lesson == cleaned_lesson
                )
            ),
            None,
        )
        self._learning_experiences = [
            item
            for item in self._learning_experiences
            if item.id != experience_id
            and not (
                item.domain == cleaned_domain
                and item.context_key == cleaned_context_key
                and item.outcome_type == normalized_outcome
                and item.summary == cleaned_summary
                and item.lesson == cleaned_lesson
            )
        ]
        merged_tags = [tag.strip().lower() for tag in (tags or []) if tag.strip()]
        if duplicate:
            merged_tags = list(dict.fromkeys([*duplicate.tags, *merged_tags]))
        self._learning_experiences.insert(
            0,
            LearningExperience(
                id=duplicate.id if duplicate else experience_id,
                label=cleaned_label,
                domain=cleaned_domain,
                context_key=cleaned_context_key,
                outcome_type=normalized_outcome,
                summary=cleaned_summary,
                lesson=cleaned_lesson,
                reuse_hint=cleaned_reuse_hint,
                tags=merged_tags,
                confidence=min(1.0, max(clamped_confidence, duplicate.confidence + 0.05 if duplicate else clamped_confidence)),
                use_count=(duplicate.use_count + 1) if duplicate else 1,
                last_reused_at=duplicate.last_reused_at if duplicate else "",
                created_at=created_at,
            ),
        )
        self._learning_experiences = self._learning_experiences[:60]
        self._save()
        return self.snapshot()

    def mark_learning_reused(self, experience_id: str, *, reused_at: str = "") -> dict[str, Any]:
        cleaned_id = experience_id.strip()
        if not cleaned_id:
            raise ValueError("Learning experience id is required")
        experience = next((item for item in self._learning_experiences if item.id == cleaned_id), None)
        if experience is None:
            raise ValueError("Learning experience not found")
        experience.use_count = max(1, int(experience.use_count) + 1)
        experience.confidence = min(1.0, max(0.05, float(experience.confidence) + 0.03))
        experience.last_reused_at = (reused_at or datetime.now(timezone.utc).isoformat()).strip()
        self._save()
        return self.snapshot()

    def top_learning_experiences(
        self,
        *,
        domain: str = "",
        context_key: str = "",
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        cleaned_domain = domain.strip().lower()
        cleaned_context_key = context_key.strip()

        def _timestamp(value: LearningExperience) -> float:
            try:
                return datetime.fromisoformat(value.created_at.replace("Z", "+00:00")).timestamp()
            except Exception:
                return 0.0

        def _reuse_timestamp(value: LearningExperience) -> float:
            try:
                return datetime.fromisoformat(value.last_reused_at.replace("Z", "+00:00")).timestamp()
            except Exception:
                return 0.0

        ranked: list[tuple[float, LearningExperience]] = []
        for item in self._learning_experiences:
            score = 0.0
            if cleaned_domain:
                if item.domain == cleaned_domain:
                    score += 4.0
                elif cleaned_domain in item.tags:
                    score += 1.5
                else:
                    continue
            if cleaned_context_key:
                if item.context_key == cleaned_context_key:
                    score += 5.0
                elif item.context_key and (
                    cleaned_context_key.endswith(item.context_key)
                    or item.context_key.endswith(cleaned_context_key)
                ):
                    score += 3.5
                elif item.context_key and cleaned_context_key in item.context_key:
                    score += 2.5
                elif item.context_key:
                    score -= 0.5
            if item.outcome_type == "success":
                score += 0.4
            elif item.outcome_type == "mistake":
                score += 0.7
            elif item.outcome_type == "anti-pattern":
                score += 1.2
            score += min(max(item.confidence, 0.05) * 2.5, 2.5)
            score += min(max(item.use_count, 1) * 0.2, 2.0)
            score += min(_timestamp(item) / 10_000_000_000, 2.0)
            score += min(_reuse_timestamp(item) / 10_000_000_000, 1.5)
            ranked.append((score, item))
        ranked.sort(key=lambda pair: pair[0], reverse=True)
        return [asdict(item) for _, item in ranked[: max(1, limit)]]

    def analytics_summary(self) -> dict[str, Any]:
        blocked_missions = [
            item
            for item in self._missions
            if item.status.strip().lower() in {"blocked", "needs_attention", "stalled", "error"}
        ]
        active_missions = [
            item
            for item in self._missions
            if item.status.strip().lower() in {"active", "running", "in_progress", "pending"}
        ]
        bottlenecks = self.top_learning_experiences(limit=4)
        focus: list[str] = []
        if blocked_missions:
            focus.append(f"Clear {len(blocked_missions)} blocked mission{'s' if len(blocked_missions) != 1 else ''}.")
        if self._signals.urgent_reviews:
            focus.append(f"Handle {self._signals.urgent_reviews} urgent review signal{'s' if self._signals.urgent_reviews != 1 else ''}.")
        if active_missions and not focus:
            focus.append(f"Advance {active_missions[0].title} next.")
        if not focus and bottlenecks:
            focus.append(f"Use the lesson from {bottlenecks[0].get('label', 'recent work')} to avoid repeat friction.")
        if not focus:
            focus.append("No major bottleneck is dominating right now.")

        return {
            "signals": asdict(self._signals),
            "active_missions": [
                {
                    "id": item.id,
                    "title": item.title,
                    "status": item.status,
                    "phase": item.phase,
                    "next_step": item.next_step,
                }
                for item in active_missions[:5]
            ],
            "blocked_missions": [
                {
                    "id": item.id,
                    "title": item.title,
                    "status": item.status,
                    "phase": item.phase,
                    "next_step": item.next_step,
                }
                for item in blocked_missions[:5]
            ],
            "top_lessons": bottlenecks,
            "focus_recommendations": focus,
            "review_items": [asdict(item) for item in self._review_items[:8]],
        }

    def add_review_item(
        self,
        *,
        category: str,
        label: str,
        summary: str,
        detail: str = "",
        source: str = "manual",
        status: str = "open",
    ) -> dict[str, Any]:
        cleaned_summary = summary.strip()
        if not cleaned_summary:
            raise ValueError("Review summary is required")
        cleaned_category = category.strip().lower() or "quality"
        cleaned_status = status.strip().lower() or "open"
        review_id = f"review-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        self._review_items = [
            item
            for item in self._review_items
            if not (
                item.category == cleaned_category
                and item.summary.strip().lower() == cleaned_summary.lower()
                and item.status == cleaned_status
            )
        ]
        self._review_items.insert(
            0,
            ReviewItem(
                id=review_id,
                category=cleaned_category,
                label=label.strip() or "Review item",
                summary=cleaned_summary,
                detail=detail.strip(),
                source=source.strip() or "manual",
                status=cleaned_status,
                created_at=datetime.now(timezone.utc).isoformat(),
            ),
        )
        self._review_items = self._review_items[:40]
        self._save()
        return self.snapshot()

    def update_mission(self, mission_id: str, partial: dict[str, Any]) -> dict[str, Any]:
        cleaned_id = mission_id.strip()
        title = str(partial.get("title", "")).strip()
        if not cleaned_id:
            raise ValueError("Mission id is required")
        if not title:
            raise ValueError("Mission title is required")
        existing = next((item for item in self._missions if item.id == cleaned_id), None)
        mission = existing or MissionMemory(id=cleaned_id, title=title)
        mission.title = title
        mission.domain = str(partial.get("domain", mission.domain)).strip()
        mission.status = str(partial.get("status", mission.status)).strip() or mission.status
        mission.phase = str(partial.get("phase", mission.phase)).strip() or mission.phase
        mission.summary = str(partial.get("summary", mission.summary)).strip()
        mission.next_step = str(partial.get("next_step", mission.next_step)).strip()
        mission.result = str(partial.get("result", mission.result)).strip()
        mission.retry_hint = str(partial.get("retry_hint", mission.retry_hint)).strip()
        if "result_data" in partial and isinstance(partial.get("result_data"), dict):
            mission.result_data = dict(partial.get("result_data") or {})
        if "next_action" in partial and isinstance(partial.get("next_action"), dict):
            mission.next_action = dict(partial.get("next_action") or {})
        mission.updated_at = str(partial.get("updated_at", mission.updated_at)).strip()
        self._missions = [item for item in self._missions if item.id != cleaned_id]
        self._missions.insert(0, mission)
        self._missions = self._missions[:24]
        self._save()
        return self.snapshot()

    def _persist_visual_asset(self, observation_id: str, image_data_url: str) -> str:
        header, _, payload = image_data_url.partition(",")
        if not payload:
            return ""
        mime = header.split(";")[0].replace("data:", "").strip().lower()
        ext = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }.get(mime, ".png")
        target_dir = DEFAULT_CONFIG_DIR / "visual_memory"
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{observation_id}{ext}"
        target.write_bytes(base64.b64decode(payload))
        return str(target)


__all__ = ["OperatorMemory"]
