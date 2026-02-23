"""Agents pillar — multi-turn reasoning and tool use."""

from __future__ import annotations

from openjarvis.agents._stubs import AgentContext, AgentResult, BaseAgent

# Import agent modules to trigger @AgentRegistry.register() decorators
try:
    import openjarvis.agents.simple  # noqa: F401
except ImportError:
    pass

try:
    import openjarvis.agents.orchestrator  # noqa: F401
except ImportError:
    pass

try:
    import openjarvis.agents.custom  # noqa: F401
except ImportError:
    pass

try:
    import openjarvis.agents.react  # noqa: F401
except ImportError:
    pass

try:
    import openjarvis.agents.openhands  # noqa: F401
except ImportError:
    pass

try:
    import openjarvis.agents.rlm  # noqa: F401
except ImportError:
    pass

__all__ = ["AgentContext", "AgentResult", "BaseAgent"]
