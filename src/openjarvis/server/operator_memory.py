"""Durable operator memory for learned preferences and relationship context."""

from __future__ import annotations

import base64
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from openjarvis.core.config import DEFAULT_CONFIG_DIR


@dataclass(slots=True)
class OperatorProfile:
    honorific: str = "sir"
    reply_tone: str = "clear and concise"
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
        self._explicit_memories: list[ExplicitMemory] = []
        self._visual_observations: list[VisualObservation] = []
        self._visual_insights: list[VisualInsight] = []
        self._visual_briefs: list[VisualBrief] = []
        self._document_briefs: list[DocumentBrief] = []
        self._design_briefs: list[DesignBrief] = []
        self._missions: list[MissionMemory] = []
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

    def _save(self) -> None:
        payload = {
            "profile": asdict(self._profile),
            "signals": asdict(self._signals),
            "relationships": {key: asdict(value) for key, value in self._relationships.items()},
            "meetings": {key: asdict(value) for key, value in self._meetings.items()},
            "projects": {key: asdict(value) for key, value in self._projects.items()},
            "explicit_memories": [asdict(value) for value in self._explicit_memories],
            "visual_observations": [asdict(value) for value in self._visual_observations],
            "visual_insights": [asdict(value) for value in self._visual_insights],
            "visual_briefs": [asdict(value) for value in self._visual_briefs],
            "document_briefs": [asdict(value) for value in self._document_briefs],
            "design_briefs": [asdict(value) for value in self._design_briefs],
            "missions": [asdict(value) for value in self._missions],
        }
        self._path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def snapshot(self) -> dict[str, Any]:
        return {
            "profile": asdict(self._profile),
            "signals": asdict(self._signals),
            "relationships": {key: asdict(value) for key, value in self._relationships.items()},
            "meetings": {key: asdict(value) for key, value in self._meetings.items()},
            "projects": {key: asdict(value) for key, value in self._projects.items()},
            "explicit_memories": [asdict(value) for value in self._explicit_memories],
            "visual_observations": [asdict(value) for value in self._visual_observations],
            "visual_insights": [asdict(value) for value in self._visual_insights],
            "visual_briefs": [asdict(value) for value in self._visual_briefs],
            "document_briefs": [asdict(value) for value in self._document_briefs],
            "design_briefs": [asdict(value) for value in self._design_briefs],
            "missions": [asdict(value) for value in self._missions],
        }

    def update_profile(self, partial: dict[str, Any]) -> dict[str, Any]:
        if "honorific" in partial:
            self._profile.honorific = str(partial["honorific"]).strip() or self._profile.honorific
        if "reply_tone" in partial:
            self._profile.reply_tone = str(partial["reply_tone"]).strip() or self._profile.reply_tone
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
