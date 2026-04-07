"""Server-side voice loop session state for the JARVIS HUD."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Literal

from openjarvis.speech.live_audio import LiveAudioGate

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
    always_listening: bool = False
    phase: VoiceLoopPhase = "idle"
    session_id: str | None = None
    started_at: float | None = None
    updated_at: float = field(default_factory=time.time)
    backend_available: bool = False
    backend_name: str | None = None
    language_hints: list[str] = field(default_factory=lambda: ["no", "en"])
    wake_phrases: list[str] = field(default_factory=lambda: ["hey jarvis", "ok jarvis"])
    wake_required: bool = True
    wake_detected: bool = False
    last_wake_phrase: str = ""
    last_transcript: str = ""
    last_command: str = ""
    command_count: int = 0
    interrupted: bool = False
    live_vad_enabled: bool = True
    vad_backend: str = "energy"
    wake_backend: str = "transcript"
    last_vad_rms: float = 0.0
    last_wake_score: float | None = None
    last_error: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class VoiceLoopManager:
    """Tracks the active HUD voice session and evaluates continuous audio chunks."""

    def __init__(
        self,
        *,
        speech_backend=None,
        language_hints: list[str] | None = None,
        wake_phrases: list[str] | None = None,
        wake_required: bool = True,
        live_vad_enabled: bool = True,
        vad_backend: str = "auto",
        vad_threshold: float = 0.016,
        vad_min_speech_ms: int = 250,
        wake_backend: str = "transcript",
        wake_model_path: str = "",
        wake_threshold: float = 0.5,
    ) -> None:
        self._speech_backend = speech_backend
        self._lock = threading.Lock()
        backend_available = bool(speech_backend and speech_backend.health())
        backend_name = (
            getattr(speech_backend, "backend_id", None) if speech_backend else None
        )
        self._snapshot = VoiceLoopSnapshot(
            backend_available=backend_available,
            backend_name=backend_name,
            language_hints=list(language_hints or ["no", "en"]),
            wake_phrases=list(wake_phrases or ["hey jarvis", "ok jarvis"]),
            wake_required=wake_required,
            live_vad_enabled=live_vad_enabled,
            vad_backend=vad_backend,
            wake_backend=wake_backend,
        )
        self._audio_gate = LiveAudioGate(
            vad_enabled=live_vad_enabled,
            vad_backend=vad_backend,
            vad_threshold=vad_threshold,
            vad_min_speech_ms=vad_min_speech_ms,
            wake_backend=wake_backend,
            wake_model_path=wake_model_path,
            wake_threshold=wake_threshold,
        )

    @staticmethod
    def _strip_wake_phrase(text: str, wake_phrases: list[str]) -> tuple[bool, str]:
        stripped = text.strip()
        normalized = " ".join(stripped.lower().split())
        if not normalized:
            return False, ""

        for phrase in wake_phrases:
            candidate = " ".join(phrase.lower().strip().split())
            if not candidate:
                continue
            if normalized == candidate:
                return True, phrase.strip()
            if stripped.lower().startswith(f"{candidate} "):
                return True, phrase.strip()
        return False, text.strip()

    @staticmethod
    def _remove_wake_prefix(text: str, wake_phrase: str) -> str:
        normalized_phrase = " ".join(wake_phrase.lower().split())
        original = text.strip()
        original_lower = " ".join(original.lower().split())
        if original_lower == normalized_phrase:
            return ""
        if original.lower().startswith(f"{normalized_phrase} "):
            return original[len(wake_phrase.strip()) :].strip()
        return original

    def _transcribe_with_hints(
        self,
        audio_bytes: bytes,
        *,
        format: str,
        language_hints: list[str] | None = None,
    ):
        backend = self._speech_backend
        if backend is None:
            raise RuntimeError("Speech backend not available")

        hints = [h.strip() for h in (language_hints or self._snapshot.language_hints) if h]
        attempts = [None, *hints]
        seen: set[str] = set()
        last_result = None
        last_error = None

        for hint in attempts:
            key = hint or "__auto__"
            if key in seen:
                continue
            seen.add(key)
            try:
                result = backend.transcribe(audio_bytes, format=format, language=hint)
                last_result = result
                if result.text.strip():
                    return result
            except Exception as exc:
                last_error = exc

        if last_result is not None:
            return last_result
        if last_error is not None:
            raise last_error
        raise RuntimeError("Unable to transcribe audio")

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
            self._snapshot.always_listening = True
            self._snapshot.phase = "listening"
            self._snapshot.session_id = uuid.uuid4().hex
            self._snapshot.started_at = time.time()
            self._snapshot.updated_at = self._snapshot.started_at
            self._snapshot.last_error = ""
            self._snapshot.last_transcript = ""
            self._snapshot.last_command = ""
            self._snapshot.last_wake_phrase = ""
            self._snapshot.command_count = 0
            self._snapshot.interrupted = False
            self._snapshot.last_vad_rms = 0.0
            self._snapshot.last_wake_score = None
            self._snapshot.wake_detected = not self._snapshot.wake_required
            if language_hints:
                self._snapshot.language_hints = list(language_hints)
            return self._snapshot.to_dict()

    def stop(self) -> dict:
        with self._lock:
            self._refresh_backend()
            self._snapshot.active = False
            self._snapshot.always_listening = False
            self._snapshot.phase = "idle"
            self._snapshot.session_id = None
            self._snapshot.started_at = None
            self._snapshot.updated_at = time.time()
            self._snapshot.last_error = ""
            self._snapshot.wake_detected = False
            self._snapshot.last_wake_phrase = ""
            self._snapshot.interrupted = False
            self._snapshot.last_vad_rms = 0.0
            self._snapshot.last_wake_score = None
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
                    self._snapshot.always_listening = False
            self._snapshot.updated_at = time.time()
            return self._snapshot.to_dict()

    def ingest_transcript(self, transcript: str) -> dict:
        with self._lock:
            self._refresh_backend()
            cleaned = transcript.strip()
            self._snapshot.last_transcript = cleaned
            self._snapshot.last_command = ""
            self._snapshot.interrupted = False
            self._snapshot.updated_at = time.time()

            if not cleaned:
                return {
                    **self._snapshot.to_dict(),
                    "accepted": False,
                    "wake_matched": False,
                    "command": "",
                    "message": "No speech detected",
                }

            if not self._snapshot.wake_required:
                self._snapshot.wake_detected = True
                self._snapshot.last_command = cleaned
                self._snapshot.command_count += 1
                return {
                    **self._snapshot.to_dict(),
                    "accepted": True,
                    "wake_matched": True,
                    "command": cleaned,
                    "message": "Command accepted",
                }

            wake_matched, matched_phrase = self._strip_wake_phrase(
                cleaned,
                self._snapshot.wake_phrases,
            )

            if wake_matched:
                self._snapshot.wake_detected = True
                self._snapshot.last_wake_phrase = matched_phrase
                command = self._remove_wake_prefix(cleaned, matched_phrase)
                if command:
                    self._snapshot.last_command = command
                    self._snapshot.command_count += 1
                    return {
                        **self._snapshot.to_dict(),
                        "accepted": True,
                        "wake_matched": True,
                        "command": command,
                        "message": "Wake phrase detected. Command accepted.",
                    }
                return {
                    **self._snapshot.to_dict(),
                    "accepted": False,
                    "wake_matched": True,
                    "command": "",
                    "message": "Wake phrase detected. Awaiting command.",
                }

            if self._snapshot.wake_detected:
                self._snapshot.last_command = cleaned
                self._snapshot.command_count += 1
                return {
                    **self._snapshot.to_dict(),
                    "accepted": True,
                    "wake_matched": True,
                    "command": cleaned,
                    "message": "Follow-up command accepted.",
                }

            return {
                **self._snapshot.to_dict(),
                "accepted": False,
                "wake_matched": False,
                "command": "",
                    "message": "Wake phrase required",
                }

    def process_audio(
        self,
        audio_bytes: bytes,
        *,
        format: str = "webm",
        language_hints: list[str] | None = None,
    ) -> dict:
        with self._lock:
            self._refresh_backend()
            if not self._snapshot.active:
                return {
                    **self._snapshot.to_dict(),
                    "accepted": False,
                    "wake_matched": False,
                    "command": "",
                    "message": "Voice loop is not active",
                }
            previous_phase = self._snapshot.phase
            self._snapshot.phase = "transcribing"
            self._snapshot.updated_at = time.time()
            if language_hints:
                self._snapshot.language_hints = list(language_hints)

        try:
            analysis = self._audio_gate.analyze(audio_bytes, format=format)
            with self._lock:
                self._snapshot.vad_backend = analysis.vad_backend
                self._snapshot.wake_backend = analysis.wake_backend
                self._snapshot.last_vad_rms = analysis.rms_level
                self._snapshot.last_wake_score = analysis.wake_score
                if analysis.wake_detected:
                    self._snapshot.wake_detected = True
                    self._snapshot.last_wake_phrase = "wake-model"
            if not analysis.speech_detected:
                with self._lock:
                    self._snapshot.phase = "listening"
                    self._snapshot.updated_at = time.time()
                    snapshot = self._snapshot.to_dict()
                return {
                    **snapshot,
                    "accepted": False,
                    "wake_matched": False,
                    "command": "",
                    "message": "No speech detected",
                    "transcript": "",
                    "language": None,
                    "confidence": None,
                    "duration_seconds": analysis.duration_seconds,
                    "interrupted": False,
                }

            result = self._transcribe_with_hints(
                audio_bytes,
                format=format,
                language_hints=language_hints,
            )
        except Exception as exc:
            return self.update(phase="error", error=str(exc)) | {
                "accepted": False,
                "wake_matched": False,
                "command": "",
                "message": str(exc),
            }

        payload = self.ingest_transcript(result.text)
        if analysis.wake_detected and result.text.strip() and not payload.get("accepted"):
            with self._lock:
                self._snapshot.wake_detected = True
                self._snapshot.last_wake_phrase = "wake-model"
                self._snapshot.last_command = result.text.strip()
                self._snapshot.command_count += 1
                payload = {
                    **self._snapshot.to_dict(),
                    "accepted": True,
                    "wake_matched": True,
                    "command": result.text.strip(),
                    "message": "Wake model triggered. Command accepted.",
                }
        interrupted = False
        with self._lock:
            if payload.get("accepted") and previous_phase == "speaking":
                interrupted = True
            self._snapshot.interrupted = interrupted
            self._snapshot.phase = "listening"
            self._snapshot.updated_at = time.time()
            snapshot = self._snapshot.to_dict()

        return {
            **snapshot,
            **{k: payload[k] for k in ("accepted", "wake_matched", "command", "message")},
            "transcript": result.text,
            "language": result.language,
            "confidence": result.confidence,
            "duration_seconds": result.duration_seconds,
            "interrupted": interrupted,
        }


__all__ = ["VoiceLoopManager", "VoiceLoopSnapshot", "VoiceLoopPhase"]
