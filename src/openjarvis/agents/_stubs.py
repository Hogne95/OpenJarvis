"""ABC for agent implementations.

Adapted from IPW's ``BaseAgent`` at ``src/agents/base.py``.
Phase 3 will provide concrete implementations (SimpleAgent, OrchestratorAgent, etc.).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from openjarvis.core.types import Conversation, ToolResult


@dataclass(slots=True)
class AgentContext:
    """Runtime context handed to an agent on each invocation."""

    conversation: Conversation = field(default_factory=Conversation)
    tools: List[str] = field(default_factory=list)
    memory_results: List[Any] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AgentResult:
    """Result returned after an agent completes a run."""

    content: str
    tool_results: List[ToolResult] = field(default_factory=list)
    turns: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


class BaseAgent(ABC):
    """Base class for all agent implementations.

    Subclasses must be registered via
    ``@AgentRegistry.register("name")`` to become discoverable.
    """

    agent_id: str

    @abstractmethod
    def run(
        self,
        input: str,
        context: Optional[AgentContext] = None,
        **kwargs: Any,
    ) -> AgentResult:
        """Execute the agent on *input* and return an ``AgentResult``."""


__all__ = ["AgentContext", "AgentResult", "BaseAgent"]
