"""Durable operator memory for learned preferences and relationship context."""

from __future__ import annotations

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


class OperatorMemory:
    """Simple JSON-backed operator memory for cross-session HUD personalization."""

    def __init__(self, path: str = "") -> None:
        self._path = Path(path) if path else DEFAULT_CONFIG_DIR / "operator_memory.json"
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._profile = OperatorProfile()
        self._signals = OperatorSignals()
        self._relationships: dict[str, ContactMemory] = {}
        self._meetings: dict[str, MeetingMemory] = {}
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

    def _save(self) -> None:
        payload = {
            "profile": asdict(self._profile),
            "signals": asdict(self._signals),
            "relationships": {key: asdict(value) for key, value in self._relationships.items()},
            "meetings": {key: asdict(value) for key, value in self._meetings.items()},
        }
        self._path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def snapshot(self) -> dict[str, Any]:
        return {
            "profile": asdict(self._profile),
            "signals": asdict(self._signals),
            "relationships": {key: asdict(value) for key, value in self._relationships.items()},
            "meetings": {key: asdict(value) for key, value in self._meetings.items()},
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


__all__ = ["OperatorMemory"]
