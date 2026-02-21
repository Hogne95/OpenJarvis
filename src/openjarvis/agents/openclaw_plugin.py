"""OpenClaw plugin skeleton — wraps OpenJarvis as an OpenClaw provider."""

from __future__ import annotations

from typing import Any, Dict, List


class ProviderPlugin:
    """Wraps OpenJarvis as an OpenClaw ProviderPlugin.

    Implements the provider interface expected by the OpenClaw framework:
    ``generate()`` for inference and ``list_models()`` for model discovery.
    """

    def __init__(self, engine: Any = None, model: str = "", bus: Any = None) -> None:
        self._engine = engine
        self._model = model
        self._bus = bus

    def generate(self, prompt: str, **kwargs: Any) -> Dict[str, Any]:
        """Generate a response using the wrapped OpenJarvis engine."""
        if self._engine is None:
            raise RuntimeError("No engine configured for ProviderPlugin")

        from openjarvis.core.types import Message, Role

        messages = [Message(role=Role.USER, content=prompt)]
        if self._bus:
            from openjarvis.telemetry.wrapper import instrumented_generate

            return instrumented_generate(
                self._engine, messages, model=self._model,
                bus=self._bus, **kwargs,
            )
        return self._engine.generate(messages, model=self._model, **kwargs)

    def list_models(self) -> List[str]:
        """List available models from the wrapped engine."""
        if self._engine is None:
            return []
        return self._engine.list_models()


class MemorySearchManager:
    """OpenClaw search/sync/status interface backed by memory."""

    def __init__(self, backend: Any = None) -> None:
        self._backend = backend

    def search(self, query: str, *, top_k: int = 5) -> List[Dict[str, Any]]:
        """Search memory for relevant documents."""
        if self._backend is None:
            return []
        results = self._backend.retrieve(query, top_k=top_k)
        return [
            {"content": r.content, "score": r.score, "source": r.source}
            for r in results
        ]

    def sync(self) -> Dict[str, Any]:
        """Synchronize memory state (no-op for now)."""
        return {"status": "ok", "synced": True}

    def status(self) -> Dict[str, Any]:
        """Return the memory backend status."""
        if self._backend is None:
            return {"available": False}
        bid = getattr(self._backend, "backend_id", "unknown")
        return {"available": True, "backend": bid}


def register() -> Dict[str, Any]:
    """Entry point for OpenClaw plugin registration.

    Returns a dict describing the plugin capabilities.
    """
    return {
        "name": "openjarvis",
        "version": "1.0.0",
        "capabilities": ["inference", "memory"],
        "provider_class": ProviderPlugin,
        "memory_class": MemorySearchManager,
    }


__all__ = ["MemorySearchManager", "ProviderPlugin", "register"]
