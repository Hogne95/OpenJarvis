"""Helpers for layered assistant memory presentation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class AssistantMemoryLayers:
    identity: list[dict[str, Any]] = field(default_factory=list)
    session_focus: list[dict[str, Any]] = field(default_factory=list)
    long_term: list[dict[str, Any]] = field(default_factory=list)

    def flattened(self, *, limit: int | None = None) -> list[dict[str, Any]]:
        items = [*self.identity, *self.session_focus, *self.long_term]
        if limit is None:
            return items
        return items[: max(0, limit)]

    def has_content(self) -> bool:
        return bool(self.identity or self.session_focus or self.long_term)


def format_layered_memory_context(layers: AssistantMemoryLayers) -> str:
    if not layers.has_content():
        return ""

    sections: list[str] = ["Relevant operator memory (use only if it clearly improves the answer):"]
    for title, items in (
        ("Identity/Profile", layers.identity),
        ("Session Focus", layers.session_focus),
        ("Long-Term Memory", layers.long_term),
    ):
        if not items:
            continue
        sections.append(f"{title}:")
        for item in items:
            label = str(item.get("label", "Memory")).strip() or "Memory"
            detail = str(item.get("detail", "")).strip()
            reason = str(item.get("reason", "")).strip()
            line = f"- {label}: {detail}"
            if reason:
                line += f" ({reason})"
            sections.append(line)
    return "\n".join(sections)


__all__ = ["AssistantMemoryLayers", "format_layered_memory_context"]
