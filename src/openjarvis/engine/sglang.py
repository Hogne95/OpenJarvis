"""SGLang inference engine backend (OpenAI-compatible API)."""

from __future__ import annotations

from openjarvis.core.registry import EngineRegistry
from openjarvis.engine._openai_compat import _OpenAICompatibleEngine


@EngineRegistry.register("sglang")
class SGLangEngine(_OpenAICompatibleEngine):
    """SGLang backend — thin wrapper over the shared OpenAI-compatible base."""

    engine_id = "sglang"
    _default_host = "http://localhost:30000"


__all__ = ["SGLangEngine"]
