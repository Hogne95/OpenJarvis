"""Speech, voice-loop, and runtime readiness routes."""

from __future__ import annotations

import importlib.util
import logging
import os
import threading
from pathlib import Path
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class VoiceLoopStartRequest(BaseModel):
    language_hints: Optional[List[str]] = None


class VoiceLoopUpdateRequest(BaseModel):
    phase: Literal[
        "idle",
        "listening",
        "recording",
        "transcribing",
        "speaking",
        "error",
    ]
    transcript: Optional[str] = None
    error: Optional[str] = None


class VoiceLoopIngestRequest(BaseModel):
    transcript: str


class VoiceLoopInterruptRequest(BaseModel):
    reason: Optional[str] = None


class VoiceLoopProcessResponse(BaseModel):
    accepted: bool
    wake_matched: bool
    command: str
    message: str
    transcript: str = ""
    language: Optional[str] = None
    confidence: Optional[float] = None
    duration_seconds: float = 0.0
    interrupted: bool = False


class SpeechSynthesizeRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    backend: Optional[str] = None
    speed: Optional[float] = None
    output_format: str = "wav"


speech_router = APIRouter(prefix="/v1/speech", tags=["speech"])
system_router = APIRouter(prefix="/v1", tags=["system"])
voice_loop_router = APIRouter(prefix="/v1/voice-loop", tags=["voice-loop"])


def _get_tts_backend(app_state: Any, backend_key: str, backend_cls: type) -> tuple[Any, threading.Lock]:
    """Reuse warm TTS backends so local voices do not reload on every reply."""
    cache = getattr(app_state, "tts_backend_cache", None)
    if not isinstance(cache, dict):
        cache = {}
        setattr(app_state, "tts_backend_cache", cache)

    locks = getattr(app_state, "tts_backend_locks", None)
    if not isinstance(locks, dict):
        locks = {}
        setattr(app_state, "tts_backend_locks", locks)

    backend = cache.get(backend_key)
    if backend is None:
        backend = backend_cls()
        cache[backend_key] = backend

    lock = locks.get(backend_key)
    if lock is None:
        lock = threading.Lock()
        locks[backend_key] = lock

    return backend, lock


def _synthesize_with_tts_backend(
    backend: Any,
    lock: threading.Lock,
    text: str,
    *,
    voice_id: str,
    speed: float,
    output_format: str,
):
    with lock:
        return backend.synthesize(
            text,
            voice_id=voice_id,
            speed=speed,
            output_format=output_format,
        )


def _package_ready(module_name: str) -> bool:
    try:
        return importlib.util.find_spec(module_name) is not None
    except Exception:
        return False


def _safe_backend_health(backend: Any) -> tuple[bool, str]:
    """Return backend health without letting probe errors break status routes."""
    if backend is None:
        return False, "No backend configured"
    try:
        healthy = bool(backend.health())
    except Exception as exc:
        logger.warning("Backend health probe failed for %s: %s", getattr(backend, "backend_id", type(backend).__name__), exc)
        return False, str(exc)
    if healthy:
        return True, ""
    return False, "Backend reported unhealthy"


def _safe_voice_loop_status(voice_loop: Any) -> dict[str, Any]:
    """Return voice loop status without raising into the HUD."""
    if voice_loop is None:
        return {
            "active": False,
            "phase": "idle",
            "session_id": None,
            "started_at": None,
            "updated_at": None,
            "backend_available": False,
            "backend_name": None,
            "language_hints": ["no", "en"],
            "live_vad_enabled": False,
            "vad_backend": "energy",
            "wake_requested_backend": "transcript",
            "wake_backend": "transcript",
            "wake_available": True,
            "wake_reason": "",
            "last_vad_rms": 0.0,
            "last_wake_score": None,
            "last_transcript": "",
            "recent_transcripts": [],
            "last_transcribe_ms": 0.0,
            "last_process_ms": 0.0,
            "last_audio_duration_seconds": 0.0,
            "interruption_count": 0,
            "last_interruption_at": None,
            "tts_active": False,
            "tts_started_at": None,
            "last_error": "Voice loop manager not configured",
        }
    try:
        return voice_loop.status()
    except Exception as exc:
        logger.warning("Voice loop status probe failed: %s", exc)
        return {
            "active": False,
            "phase": "error",
            "session_id": None,
            "started_at": None,
            "updated_at": None,
            "backend_available": False,
            "backend_name": getattr(voice_loop, "backend_id", None),
            "language_hints": ["no", "en"],
            "live_vad_enabled": False,
            "vad_backend": "energy",
            "wake_requested_backend": "transcript",
            "wake_backend": "transcript",
            "wake_available": False,
            "wake_reason": str(exc),
            "last_vad_rms": 0.0,
            "last_wake_score": None,
            "last_transcript": "",
            "recent_transcripts": [],
            "last_transcribe_ms": 0.0,
            "last_process_ms": 0.0,
            "last_audio_duration_seconds": 0.0,
            "interruption_count": 0,
            "last_interruption_at": None,
            "tts_active": False,
            "tts_started_at": None,
            "last_error": str(exc),
        }


def _desktop_report_status(repo_root: Path) -> tuple[str, str, str]:
    report_path = repo_root / "desktop-readiness-report.txt"
    if not report_path.exists():
        return (
            "warning",
            "No combined desktop readiness report found yet.",
            "Run collect_openjarvis_desktop_report.bat or the PowerShell script to generate a fresh report.",
        )
    try:
        content = report_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return (
            "warning",
            "Desktop readiness report exists but could not be read.",
            "Re-run the combined desktop report script to refresh the artifact.",
        )
    lowered = content.lower()
    if "wdac" in lowered or "code integrity" in lowered or "app control" in lowered:
        return (
            "blocked",
            "Windows policy is still blocking native desktop packaging.",
            "Use the policy checker and unblock WDAC / App Control before retrying native packaging.",
        )
    if "mostly ready" in lowered or "environment is mostly ready" in lowered:
        return (
            "ready",
            "Desktop environment report looks ready enough for native packaging.",
            "Retry the desktop build if you want to validate the native path again.",
        )
    return (
        "warning",
        "Desktop readiness report is present but does not clearly confirm readiness.",
        "Review the report contents before assuming native packaging is ready.",
    )


def build_runtime_readiness(app_state: Any) -> dict[str, Any]:
    repo_root = Path.cwd()
    speech_backend = getattr(app_state, "speech_backend", None)
    voice_loop = getattr(app_state, "voice_loop", None)
    speech_backend_healthy, speech_backend_error = _safe_backend_health(speech_backend)
    voice_status = _safe_voice_loop_status(voice_loop)
    api_key_present = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    openai_ready = _package_ready("openai")
    docx_ready = _package_ready("docx")
    openpyxl_ready = _package_ready("openpyxl")
    pptx_ready = _package_ready("pptx")
    desktop_script = repo_root / "check_openjarvis_desktop.ps1"
    desktop_policy_script = repo_root / "check_openjarvis_desktop_policy.ps1"
    desktop_collect_script = repo_root / "collect_openjarvis_desktop_report.ps1"
    desktop_docs = repo_root / "docs" / "deployment" / "windows-desktop-unblock.md"
    report_status, report_detail, report_recommendation = _desktop_report_status(repo_root)

    checks = [
        {
            "id": "speech-backend",
            "label": "Speech Backend",
            "status": "ready" if speech_backend_healthy else "blocked",
            "detail": (
                f"Speech backend is available via {getattr(speech_backend, 'backend_id', 'configured backend')}."
                if speech_backend_healthy
                else (
                    f"Speech backend is not healthy: {speech_backend_error}"
                    if speech_backend_error
                    else "Speech backend is not configured or not healthy."
                )
            ),
            "recommendation": (
                "Speech is ready for voice input."
                if speech_backend_healthy
                else "Configure a speech backend before relying on voice input."
            ),
        },
        {
            "id": "voice-loop",
            "label": "Voice Loop",
            "status": "ready" if voice_loop is not None else "warning",
            "detail": (
                f"Voice loop is {voice_status.get('phase') or 'idle'}."
                if voice_loop is not None
                else "Voice loop manager is not configured."
            ),
            "recommendation": (
                "Voice loop is available for always-listening mode."
                if voice_loop is not None
                else "Start the server with voice loop support enabled if you want hands-free use."
            ),
        },
        {
            "id": "vision-runtime",
            "label": "Vision Runtime",
            "status": "ready" if api_key_present and openai_ready else "blocked",
            "detail": (
                "OPENAI_API_KEY and OpenAI vision runtime are available."
                if api_key_present and openai_ready
                else "Vision analysis needs OPENAI_API_KEY and the openai package."
            ),
            "recommendation": (
                "Vision and screen understanding are ready."
                if api_key_present and openai_ready
                else "Add OPENAI_API_KEY and install the OpenAI package to enable full vision flows."
            ),
        },
        {
            "id": "document-intel",
            "label": "Document Intelligence",
            "status": "ready" if api_key_present and openai_ready else "blocked",
            "detail": (
                "Document analysis can use the configured model runtime."
                if api_key_present and openai_ready
                else "Document analysis is blocked because the model runtime is not fully configured."
            ),
            "recommendation": (
                "Upload and analyze PDF / Office files normally."
                if api_key_present and openai_ready
                else "Configure the OpenAI runtime before relying on Document Intel."
            ),
        },
        {
            "id": "office-exports",
            "label": "Office Parsers & Export",
            "status": "ready" if docx_ready and openpyxl_ready and pptx_ready else "warning",
            "detail": (
                "DOCX, XLSX, and PPTX packages are installed."
                if docx_ready and openpyxl_ready and pptx_ready
                else "One or more Office parsing/export packages are missing."
            ),
            "recommendation": (
                "Office parsing and export paths are ready."
                if docx_ready and openpyxl_ready and pptx_ready
                else "Install python-docx, openpyxl, and python-pptx for full Office support."
            ),
        },
        {
            "id": "desktop-tooling",
            "label": "Desktop Diagnostics",
            "status": "ready" if desktop_script.exists() and desktop_policy_script.exists() and desktop_collect_script.exists() else "warning",
            "detail": (
                "Desktop readiness, policy, and combined report scripts are present."
                if desktop_script.exists() and desktop_policy_script.exists() and desktop_collect_script.exists()
                else "One or more desktop diagnostics scripts are missing from the repo root."
            ),
            "recommendation": (
                "Use the root desktop scripts when native packaging needs debugging."
                if desktop_script.exists() and desktop_policy_script.exists() and desktop_collect_script.exists()
                else "Restore the desktop diagnostic scripts before troubleshooting native packaging."
            ),
        },
        {
            "id": "desktop-report",
            "label": "Desktop Packaging Status",
            "status": report_status,
            "detail": report_detail,
            "recommendation": report_recommendation,
        },
        {
            "id": "desktop-docs",
            "label": "Desktop Unblock Guide",
            "status": "ready" if desktop_docs.exists() else "warning",
            "detail": (
                "Windows desktop unblock guide is present in docs."
                if desktop_docs.exists()
                else "Windows desktop unblock guide is missing."
            ),
            "recommendation": (
                "Use the unblock guide before changing desktop code."
                if desktop_docs.exists()
                else "Restore the desktop unblock guide for native troubleshooting."
            ),
        },
    ]
    ready_count = sum(1 for item in checks if item["status"] == "ready")
    blocked_count = sum(1 for item in checks if item["status"] == "blocked")
    return {
        "summary": {
            "ready": ready_count,
            "blocked": blocked_count,
            "total": len(checks),
        },
        "checks": checks,
        "desktop": {
            "report_path": str(repo_root / "desktop-readiness-report.txt"),
            "scripts": {
                "check": str(desktop_script),
                "policy": str(desktop_policy_script),
                "collect": str(desktop_collect_script),
            },
            "guide_path": str(desktop_docs),
        },
    }


@speech_router.post("/transcribe")
async def transcribe_speech(request: Request):
    """Transcribe uploaded audio to text."""
    backend = getattr(request.app.state, "speech_backend", None)
    if backend is None:
        raise HTTPException(status_code=501, detail="Speech backend not configured")

    form = await request.form()
    audio_file = form.get("file")
    if audio_file is None:
        raise HTTPException(status_code=400, detail="Missing 'file' field")

    audio_bytes = await audio_file.read()
    language = form.get("language")

    filename = getattr(audio_file, "filename", "audio.wav")
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "wav"

    try:
        result = backend.transcribe(audio_bytes, format=ext, language=language or None)
    except Exception as exc:
        logger.warning("Speech transcription failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Speech transcription failed: {exc}")
    return {
        "text": result.text,
        "language": result.language,
        "confidence": result.confidence,
        "duration_seconds": result.duration_seconds,
    }


@speech_router.get("/health")
async def speech_health(request: Request):
    """Check if a speech backend is available."""
    backend = getattr(request.app.state, "speech_backend", None)
    if backend is None:
        return {"available": False, "reason": "No speech backend configured"}
    healthy, error = _safe_backend_health(backend)
    return {
        "available": healthy,
        "backend": getattr(backend, "backend_id", type(backend).__name__),
        "reason": error or None,
    }


@system_router.get("/readiness")
async def runtime_readiness(request: Request):
    return build_runtime_readiness(request.app.state)


@speech_router.get("/profile")
async def speech_profile(request: Request):
    """Return the active speech + reply voice profile."""
    config = getattr(request.app.state, "config", None)
    speech_cfg = getattr(config, "speech", None)
    if speech_cfg is None:
        return {
            "input_languages": ["no", "en"],
            "reply_language": "en",
            "wake_phrases": ["hey jarvis", "ok jarvis", "jarvis"],
            "live_vad_enabled": True,
            "vad_backend": "energy",
            "audio_chunk_ms": 2200,
            "wake_backend": "transcript",
            "reply_backend": "kokoro",
            "reply_voice_id": "am_michael",
            "auto_speak": True,
            "auto_submit_voice_commands": True,
        }
    hints = [h.strip() for h in speech_cfg.language_hints.split(",") if h.strip()]
    phrases = [p.strip() for p in speech_cfg.wake_phrases.split(",") if p.strip()]
    return {
        "input_languages": hints or ["no", "en"],
        "reply_language": speech_cfg.reply_language,
        "wake_phrases": phrases or ["hey jarvis", "ok jarvis", "jarvis"],
        "live_vad_enabled": speech_cfg.live_vad_enabled,
        "vad_backend": speech_cfg.vad_backend,
        "audio_chunk_ms": speech_cfg.audio_chunk_ms,
        "wake_backend": speech_cfg.wake_backend,
        "reply_backend": speech_cfg.reply_backend,
        "reply_voice_id": speech_cfg.reply_voice_id,
        "reply_speed": speech_cfg.reply_speed,
        "auto_speak": speech_cfg.auto_speak,
        "auto_submit_voice_commands": speech_cfg.auto_submit_voice_commands,
        "require_wake_phrase": speech_cfg.require_wake_phrase,
    }


@speech_router.post("/synthesize")
async def synthesize_speech(req: SpeechSynthesizeRequest, request: Request):
    """Synthesize assistant speech using the configured reply voice."""
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    config = getattr(request.app.state, "config", None)
    speech_cfg = getattr(config, "speech", None)
    backend_key = req.backend or getattr(speech_cfg, "reply_backend", "kokoro")
    voice_id = req.voice_id or getattr(speech_cfg, "reply_voice_id", "am_michael")
    speed = req.speed if req.speed is not None else getattr(speech_cfg, "reply_speed", 0.95)

    import openjarvis.speech  # noqa: F401
    from openjarvis.core.registry import TTSRegistry

    if not TTSRegistry.contains(backend_key):
        raise HTTPException(status_code=501, detail=f"TTS backend '{backend_key}' not available")

    try:
        backend_cls = TTSRegistry.get(backend_key)
        backend, backend_lock = _get_tts_backend(request.app.state, backend_key, backend_cls)
        result = await run_in_threadpool(
            _synthesize_with_tts_backend,
            backend,
            backend_lock,
            text,
            voice_id=voice_id,
            speed=speed,
            output_format=req.output_format,
        )
    except Exception as exc:
        logger.warning("Speech synthesis failed for backend %s: %s", backend_key, exc)
        raise HTTPException(status_code=503, detail=f"TTS synthesis failed: {exc}")

    media_type = "audio/mpeg" if result.format == "mp3" else "audio/wav"
    headers = {
        "X-Jarvis-Voice-Backend": backend_key,
        "X-Jarvis-Voice-Id": result.voice_id,
    }
    return Response(content=result.audio, media_type=media_type, headers=headers)


@voice_loop_router.get("/status")
async def voice_loop_status(request: Request):
    """Return the current HUD voice loop session state."""
    manager = getattr(request.app.state, "voice_loop", None)
    return _safe_voice_loop_status(manager)


@voice_loop_router.post("/start")
async def voice_loop_start(req: VoiceLoopStartRequest, request: Request):
    """Start an active HUD voice loop session."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    snapshot = manager.start(language_hints=req.language_hints)
    if not snapshot.get("backend_available"):
        raise HTTPException(
            status_code=503,
            detail=snapshot.get("last_error") or "Speech backend not available",
        )
    return snapshot


@voice_loop_router.post("/stop")
async def voice_loop_stop(request: Request):
    """Stop the active HUD voice loop session."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    return manager.stop()


@voice_loop_router.post("/state")
async def voice_loop_state(req: VoiceLoopUpdateRequest, request: Request):
    """Update the active HUD voice loop phase."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    return manager.update(
        phase=req.phase,
        transcript=req.transcript,
        error=req.error,
    )


@voice_loop_router.post("/interrupt")
async def voice_loop_interrupt(req: VoiceLoopInterruptRequest, request: Request):
    """Interrupt assistant speech and safely return the loop to listening."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    return manager.interrupt(reason=req.reason or "Interrupted by user")


@voice_loop_router.post("/ingest")
async def voice_loop_ingest(req: VoiceLoopIngestRequest, request: Request):
    """Evaluate a transcript against the configured wake phrase flow."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")
    return manager.ingest_transcript(req.transcript)


@voice_loop_router.post("/process-audio")
async def voice_loop_process_audio(request: Request):
    """Transcribe and evaluate a continuous audio chunk for the active voice loop."""
    manager = getattr(request.app.state, "voice_loop", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Voice loop manager not configured")

    form = await request.form()
    audio_file = form.get("file")
    if audio_file is None:
        raise HTTPException(status_code=400, detail="Missing 'file' field")

    filename = getattr(audio_file, "filename", "chunk.webm")
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "webm"
    hints_raw = form.get("language_hints", "")
    language_hints = [h.strip() for h in str(hints_raw).split(",") if h.strip()]
    audio_bytes = await audio_file.read()

    try:
        return manager.process_audio(
            audio_bytes,
            format=ext,
            language_hints=language_hints or None,
        )
    except Exception as exc:
        logger.warning("Voice loop audio processing failed: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
