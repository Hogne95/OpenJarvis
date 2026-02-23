"""Inference Engine pillar — LLM runtime management."""

from __future__ import annotations

import openjarvis.engine.llamacpp  # noqa: F401

# Import engine modules to trigger @EngineRegistry.register() decorators
import openjarvis.engine.ollama  # noqa: F401
import openjarvis.engine.sglang  # noqa: F401
import openjarvis.engine.vllm  # noqa: F401
from openjarvis.engine._base import (
    EngineConnectionError,
    InferenceEngine,
    messages_to_dicts,
)
from openjarvis.engine._discovery import discover_engines, discover_models, get_engine

# Cloud engine is optional — only register if SDK deps are present
try:
    import openjarvis.engine.cloud  # noqa: F401
except ImportError:
    pass

# LiteLLM engine is optional — only register if litellm is installed
try:
    import openjarvis.engine.litellm  # noqa: F401
except ImportError:
    pass

__all__ = [
    "EngineConnectionError",
    "InferenceEngine",
    "discover_engines",
    "discover_models",
    "get_engine",
    "messages_to_dicts",
]
