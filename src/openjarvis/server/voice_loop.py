"""Server-side voice loop session state for the JARVIS HUD."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Literal

VoiceLoopPhase = Literal[
    "idle",
    "listening",
    "recording",
    "transcribing",
    "speaking",
    "error",
]


@dataclass
class VoiceLoopSnapshot:
    active: bool = False
    phase: VoiceLoopPhase = "idle"
    session_id: str | None = None
    started_at: float | None = None
    updated_at: float = field(default_factory=time.time)
    backend_available: bool = False
    backend_name: str | None = None
    language_hints: list[str] = field(default_factory=lambda: ["no", "en"])
    last_transcript: str = ""
    last_error: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class VoiceLoopManager:
    """Tracks the active HUD voice session without changing STT internals."""

    def __init__(self, *, speech_backend=None) -> None:
        self._speech_backend = speech_backend
        self._lock = threading.Lock()
        backend_available = bool(speech_backend and speech_backend.health())
        backend_name = (
            getattr(speech_backend, "backend_id", None) if speech_backend else None
        )
        self._snapshot = VoiceLoopSnapshot(
            backend_available=backend_available,
            backend_name=backend_name,
        )

    def _refresh_backend(self) -> None:
        backend = self._speech_backend
        self._snapshot.backend_available = bool(backend and backend.health())
        self._snapshot.backend_name = getattr(backend, "backend_id", None)

    def status(self) -> dict:
        with self._lock:
            self._refresh_backend()
            return self._snapshot.to_dict()

    def start(self, *, language_hints: list[str] | None = None) -> dict:
        with self._lock:
            self._refresh_backend()
            if not self._snapshot.backend_available:
                self._snapshot.active = False
                self._snapshot.phase = "error"
                self._snapshot.last_error = "Speech backend not available"
                self._snapshot.updated_at = time.time()
                return self._snapshot.to_dict()

            self._snapshot.active = True
            self._snapshot.phase = "listening"
            self._snapshot.session_id = uuid.uuid4().hex
            self._snapshot.started_at = time.time()
            self._snapshot.updated_at = self._snapshot.started_at
            self._snapshot.last_error = ""
            self._snapshot.last_transcript = ""
            if language_hints:
                self._snapshot.language_hints = list(language_hints)
            return self._snapshot.to_dict()

    def stop(self) -> dict:
        with self._lock:
            self._refresh_backend()
            self._snapshot.active = False
            self._snapshot.phase = "idle"
            self._snapshot.session_id = None
            self._snapshot.started_at = None
            self._snapshot.updated_at = time.time()
            self._snapshot.last_error = ""
            return self._snapshot.to_dict()

    def update(
        self,
        *,
        phase: VoiceLoopPhase,
        transcript: str | None = None,
        error: str | None = None,
    ) -> dict:
        with self._lock:
            self._refresh_backend()
            self._snapshot.phase = phase
            if phase == "idle":
                self._snapshot.active = False
            elif phase in {"listening", "recording", "transcribing", "speaking"}:
                self._snapshot.active = True
            if transcript is not None:
                self._snapshot.last_transcript = transcript
            if error is not None:
                self._snapshot.last_error = error
                if error:
                    self._snapshot.phase = "error"
                    self._snapshot.active = False
            self._snapshot.updated_at = time.time()
            return self._snapshot.to_dict()


__all__ = ["VoiceLoopManager", "VoiceLoopSnapshot", "VoiceLoopPhase"]
