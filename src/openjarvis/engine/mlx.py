"""MLX inference engine backend (OpenAI-compatible API)."""

from __future__ import annotations

from openjarvis.core.registry import EngineRegistry
from openjarvis.engine._openai_compat import _OpenAICompatibleEngine


@EngineRegistry.register("mlx")
class MLXEngine(_OpenAICompatibleEngine):
    """MLX backend — thin wrapper over the shared OpenAI-compatible base."""

    engine_id = "mlx"
    _default_host = "http://localhost:8080"


__all__ = ["MLXEngine"]
