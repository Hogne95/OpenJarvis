"""Extended API routes for agents, workflows, memory, traces, etc."""

from __future__ import annotations

import inspect
import json
import logging
from typing import Any, Dict, List, Literal, Optional
from email.utils import parseaddr
from datetime import datetime, timedelta, timezone

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ---- Request/Response models ----


class AgentCreateRequest(BaseModel):
    agent_type: str
    tools: Optional[List[str]] = None
    agent_id: Optional[str] = None


class AgentMessageRequest(BaseModel):
    message: str


class MemoryStoreRequest(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = None


class MemorySearchRequest(BaseModel):
    query: str
    top_k: int = 5


class BudgetLimitsRequest(BaseModel):
    max_tokens_per_day: Optional[int] = None
    max_requests_per_hour: Optional[int] = None


class FeedbackScoreRequest(BaseModel):
    trace_id: str
    score: float
    source: str = "api"


class OptimizeRunRequest(BaseModel):
    benchmark: str
    max_trials: int = 20
    optimizer_model: str = "claude-sonnet-4-6"
    max_samples: int = 50


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


class WorkbenchStageRequest(BaseModel):
    command: str
    working_dir: Optional[str] = None
    timeout: int = 30


class ActionEmailDraftRequest(BaseModel):
    recipient: str
    subject: str
    body: str
    provider: str = "gmail"


class ActionCalendarBriefRequest(BaseModel):
    title: str
    start_at: str
    end_at: Optional[str] = None
    attendees: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class InboxActionStageRequest(BaseModel):
    action_kind: Literal["archive", "star"]
    source: str
    message_id: str
    title: str
    author: str


class ActionTaskCreateRequest(BaseModel):
    title: str
    notes: Optional[str] = None
    due_at: Optional[str] = None


class OperatorProfileUpdateRequest(BaseModel):
    honorific: Optional[str] = None
    reply_tone: Optional[str] = None
    priority_contacts: Optional[List[str] | str] = None
    workday_start: Optional[str] = None
    workday_end: Optional[str] = None


class OperatorSignalRequest(BaseModel):
    kind: Literal["reply", "meeting", "task", "urgent"]
    contact: Optional[str] = None


class OperatorRelationshipUpdateRequest(BaseModel):
    contact: str
    name: Optional[str] = None
    importance: Optional[str] = None
    relationship: Optional[str] = None
    notes: Optional[str] = None


class OperatorMeetingUpdateRequest(BaseModel):
    key: str
    title: Optional[str] = None
    importance: Optional[str] = None
    prep_style: Optional[str] = None
    notes: Optional[str] = None


class RoutineScheduleRequest(BaseModel):
    routine_id: Literal["daily_ops", "inbox_sweep", "meeting_prep"]
    enabled: bool
    cron: Optional[str] = None
    agent: str = "orchestrator"


# ---- Agent routes ----

agents_router = APIRouter(prefix="/v1/agents", tags=["agents"])


@agents_router.get("")
async def list_agents(request: Request):
    """List available agent types and running agents."""
    registered = []
    try:
        import openjarvis.agents  # noqa: F401 — side-effect registration
        from openjarvis.core.registry import AgentRegistry

        for key in sorted(AgentRegistry.keys()):
            cls = AgentRegistry.get(key)
            registered.append(
                {
                    "key": key,
                    "class": cls.__name__,
                    "accepts_tools": getattr(cls, "accepts_tools", False),
                }
            )
    except Exception as exc:
        logger.warning("Failed to list registered agents: %s", exc)

    running = []
    try:
        from openjarvis.tools.agent_tools import _SPAWNED_AGENTS

        running = [{"id": k, **v} for k, v in _SPAWNED_AGENTS.items()]
    except ImportError:
        pass

    return {"registered": registered, "running": running}


@agents_router.post("")
async def create_agent(req: AgentCreateRequest, request: Request):
    """Spawn a new agent."""
    try:
        from openjarvis.tools.agent_tools import AgentSpawnTool

        tool = AgentSpawnTool()
        params = {"agent_type": req.agent_type}
        if req.tools:
            params["tools"] = ",".join(req.tools)
        if req.agent_id:
            params["agent_id"] = req.agent_id
        result = tool.execute(**params)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.content)
        return {
            "status": "created",
            "content": result.content,
            "metadata": result.metadata,
        }
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


@agents_router.delete("/{agent_id}")
async def kill_agent(agent_id: str, request: Request):
    """Kill a running agent."""
    try:
        from openjarvis.tools.agent_tools import AgentKillTool

        tool = AgentKillTool()
        result = tool.execute(agent_id=agent_id)
        if not result.success:
            raise HTTPException(status_code=404, detail=result.content)
        return {"status": "stopped", "agent_id": agent_id}
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


@agents_router.post("/{agent_id}/message")
async def message_agent(agent_id: str, req: AgentMessageRequest, request: Request):
    """Send a message to a running agent."""
    try:
        from openjarvis.tools.agent_tools import AgentSendTool

        tool = AgentSendTool()
        result = tool.execute(agent_id=agent_id, message=req.message)
        if not result.success:
            raise HTTPException(status_code=404, detail=result.content)
        return {"status": "sent", "content": result.content}
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


# ---- Memory routes ----

memory_router = APIRouter(prefix="/v1/memory", tags=["memory"])


@memory_router.post("/store")
async def memory_store(req: MemoryStoreRequest, request: Request):
    """Store content in memory."""
    try:
        from openjarvis.tools.storage.sqlite import SQLiteMemory

        backend = SQLiteMemory()
        backend.store(req.content, metadata=req.metadata or {})
        return {"status": "stored"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@memory_router.post("/search")
async def memory_search(req: MemorySearchRequest, request: Request):
    """Search memory for relevant content."""
    try:
        from openjarvis.tools.storage.sqlite import SQLiteMemory

        backend = SQLiteMemory()
        results = backend.search(req.query, top_k=req.top_k)
        items = [
            {"content": r.content, "score": r.score, "metadata": r.metadata}
            for r in results
        ]
        return {"results": items}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@memory_router.get("/stats")
async def memory_stats(request: Request):
    """Get memory backend statistics."""
    try:
        from openjarvis.tools.storage.sqlite import SQLiteMemory

        backend = SQLiteMemory()
        stats = backend.stats()
        return stats
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Traces routes ----

traces_router = APIRouter(prefix="/v1/traces", tags=["traces"])


def _serialise_trace(trace) -> dict:
    """Convert a Trace dataclass to a frontend-friendly dict."""
    import datetime
    from dataclasses import asdict

    d = asdict(trace)
    d["id"] = d.pop("trace_id", "")
    started = d.pop("started_at", 0.0)
    d["created_at"] = (
        datetime.datetime.fromtimestamp(started, tz=datetime.timezone.utc).isoformat()
        if started
        else None
    )
    dur = d.pop("total_latency_seconds", 0.0)
    d["duration_ms"] = round(dur * 1000)
    for step in d.get("steps", []):
        st = step.get("step_type")
        if hasattr(st, "value"):
            step["step_type"] = st.value
    return d


@traces_router.get("")
async def list_traces(request: Request, limit: int = 20):
    """List recent traces."""
    try:
        store = getattr(request.app.state, "trace_store", None)
        if store is None:
            return {"traces": []}
        traces = store.list_traces(limit=limit)
        items = [_serialise_trace(t) for t in traces]
        return {"traces": items}
    except Exception as exc:
        return {"traces": [], "error": str(exc)}


@traces_router.get("/{trace_id}")
async def get_trace(trace_id: str, request: Request):
    """Get a specific trace by ID."""
    try:
        store = getattr(request.app.state, "trace_store", None)
        if store is None:
            raise HTTPException(status_code=404, detail="Trace not found")
        trace = store.get(trace_id)
        if trace is None:
            raise HTTPException(status_code=404, detail="Trace not found")
        return _serialise_trace(trace)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Telemetry routes ----

telemetry_router = APIRouter(prefix="/v1/telemetry", tags=["telemetry"])


@telemetry_router.get("/stats")
async def telemetry_stats(request: Request):
    """Get aggregated telemetry statistics."""
    try:
        from dataclasses import asdict

        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        if not db_path.exists():
            return {"total_requests": 0, "total_tokens": 0}

        session_start = getattr(request.app.state, "session_start", None)
        agg = TelemetryAggregator(db_path)
        try:
            stats = agg.summary(since=session_start)
            d = asdict(stats)
            d.pop("per_model", None)
            d.pop("per_engine", None)
            d["total_requests"] = d.pop("total_calls", 0)
            return d
        finally:
            agg.close()
    except Exception as exc:
        return {"error": str(exc)}


@telemetry_router.get("/energy")
async def telemetry_energy(request: Request):
    """Get energy monitoring data."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        if not db_path.exists():
            return {
                "total_energy_j": 0,
                "energy_per_token_j": 0,
                "avg_power_w": 0,
                "cpu_temp_c": None,
                "gpu_temp_c": None,
            }

        session_start = getattr(request.app.state, "session_start", None)
        agg = TelemetryAggregator(db_path)
        try:
            stats = agg.summary(since=session_start)
            total_energy = stats.total_energy_joules
            total_tokens = stats.total_tokens
            total_latency = stats.total_latency
            return {
                "total_energy_j": total_energy,
                "energy_per_token_j": (
                    total_energy / total_tokens if total_tokens > 0 else 0
                ),
                "avg_power_w": (
                    total_energy / total_latency if total_latency > 0 else 0
                ),
                "cpu_temp_c": None,
                "gpu_temp_c": None,
            }
        finally:
            agg.close()
    except Exception as exc:
        return {"error": str(exc)}


# ---- Skills routes ----

skills_router = APIRouter(prefix="/v1/skills", tags=["skills"])


@skills_router.get("")
async def list_skills(request: Request):
    """List installed skills."""
    try:
        from openjarvis.core.registry import SkillRegistry

        skills = []
        for key in sorted(SkillRegistry.keys()):
            skills.append({"name": key})
        return {"skills": skills}
    except Exception as exc:
        logger.warning("Failed to list skills: %s", exc)
        return {"skills": []}


@skills_router.post("")
async def install_skill(request: Request):
    """Install a skill (placeholder)."""
    return {
        "status": "not_implemented",
        "message": "Use TOML files in ~/.openjarvis/skills/",
    }


@skills_router.delete("/{skill_name}")
async def remove_skill(skill_name: str, request: Request):
    """Remove a skill (placeholder)."""
    return {
        "status": "not_implemented",
        "message": "Skill removal not yet supported via API",
    }


# ---- Sessions routes ----

sessions_router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


@sessions_router.get("")
async def list_sessions(request: Request, limit: int = 20):
    """List active sessions."""
    try:
        from openjarvis.sessions.store import SessionStore

        store = SessionStore()
        sessions = store.recent(limit=limit)
        items = [s.to_dict() if hasattr(s, "to_dict") else str(s) for s in sessions]
        return {"sessions": items}
    except Exception as exc:
        return {"sessions": [], "error": str(exc)}


@sessions_router.get("/{session_id}")
async def get_session(session_id: str, request: Request):
    """Get a specific session."""
    try:
        from openjarvis.sessions.store import SessionStore

        store = SessionStore()
        session = store.get(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return session.to_dict() if hasattr(session, "to_dict") else {"id": session_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Budget routes ----

budget_router = APIRouter(prefix="/v1/budget", tags=["budget"])

_budget_limits: Dict[str, Any] = {
    "max_tokens_per_day": None,
    "max_requests_per_hour": None,
}
_budget_usage: Dict[str, int] = {
    "tokens_today": 0,
    "requests_this_hour": 0,
}


@budget_router.get("")
async def get_budget(request: Request):
    """Get current budget usage and limits."""
    return {"limits": _budget_limits, "usage": _budget_usage}


@budget_router.put("/limits")
async def set_budget_limits(req: BudgetLimitsRequest, request: Request):
    """Update budget limits."""
    if req.max_tokens_per_day is not None:
        _budget_limits["max_tokens_per_day"] = req.max_tokens_per_day
    if req.max_requests_per_hour is not None:
        _budget_limits["max_requests_per_hour"] = req.max_requests_per_hour
    return {"status": "updated", "limits": _budget_limits}


# ---- Prometheus metrics ----

metrics_router = APIRouter(tags=["metrics"])


@metrics_router.get("/metrics")
async def prometheus_metrics(request: Request):
    """Prometheus-compatible metrics endpoint."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        if not db_path.exists():
            from starlette.responses import PlainTextResponse

            return PlainTextResponse("# no telemetry data\n", media_type="text/plain")

        agg = TelemetryAggregator(db_path)
        stats = agg.summary()

        lines = [
            "# HELP openjarvis_requests_total Total requests processed",
            "# TYPE openjarvis_requests_total counter",
            f"openjarvis_requests_total {stats.get('total_requests', 0)}",
            "# HELP openjarvis_tokens_total Total tokens generated",
            "# TYPE openjarvis_tokens_total counter",
            f"openjarvis_tokens_total {stats.get('total_tokens', 0)}",
            "# HELP openjarvis_latency_avg_ms Average latency in milliseconds",
            "# TYPE openjarvis_latency_avg_ms gauge",
            f"openjarvis_latency_avg_ms {stats.get('avg_latency_ms', 0)}",
        ]
        from starlette.responses import PlainTextResponse

        return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain")
    except Exception as exc:
        logger.warning("Failed to collect Prometheus metrics: %s", exc)
        from starlette.responses import PlainTextResponse

        return PlainTextResponse("# No metrics available\n", media_type="text/plain")


# ---- WebSocket streaming routes ----

websocket_router = APIRouter(tags=["websocket"])


@websocket_router.websocket("/v1/chat/stream")
async def websocket_chat_stream(websocket: WebSocket):
    """Stream chat responses over a WebSocket connection.

    Accepts JSON messages of the form::

        {"message": "...", "model": "...", "agent": "..."}

    Sends back JSON chunks::

        {"type": "chunk", "content": "..."}   -- per-token streaming
        {"type": "done",  "content": "..."}   -- final assembled response
        {"type": "error", "detail": "..."}    -- on failure
    """
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                await websocket.send_json(
                    {"type": "error", "detail": "Invalid JSON"},
                )
                continue

            message = data.get("message")
            if not message:
                await websocket.send_json(
                    {"type": "error", "detail": "Missing 'message' field"},
                )
                continue

            model = data.get("model") or getattr(
                websocket.app.state,
                "model",
                "default",
            )
            engine = getattr(websocket.app.state, "engine", None)
            if engine is None:
                await websocket.send_json(
                    {"type": "error", "detail": "No engine configured"},
                )
                continue

            messages = [{"role": "user", "content": message}]

            try:
                # Prefer streaming if the engine supports it
                stream_fn = getattr(engine, "stream", None)
                if stream_fn is not None and (
                    inspect.isasyncgenfunction(stream_fn) or callable(stream_fn)
                ):
                    full_content = ""
                    try:
                        gen = stream_fn(messages, model=model)
                        # Handle both async and sync generators
                        if inspect.isasyncgen(gen):
                            async for token in gen:
                                full_content += token
                                await websocket.send_json(
                                    {"type": "chunk", "content": token},
                                )
                        else:
                            # Sync generator — iterate in a thread to avoid
                            # blocking the event loop
                            for token in gen:
                                full_content += token
                                await websocket.send_json(
                                    {"type": "chunk", "content": token},
                                )
                    except TypeError:
                        # stream() didn't return an iterable; fall back to
                        # generate()
                        result = engine.generate(messages, model=model)
                        content = (
                            result.get("content", "")
                            if isinstance(
                                result,
                                dict,
                            )
                            else str(result)
                        )
                        full_content = content
                        await websocket.send_json(
                            {"type": "chunk", "content": content},
                        )
                    await websocket.send_json(
                        {"type": "done", "content": full_content},
                    )
                else:
                    # No stream method — single-shot generate
                    result = engine.generate(messages, model=model)
                    content = (
                        result.get("content", "")
                        if isinstance(
                            result,
                            dict,
                        )
                        else str(result)
                    )
                    await websocket.send_json(
                        {"type": "chunk", "content": content},
                    )
                    await websocket.send_json(
                        {"type": "done", "content": content},
                    )
            except WebSocketDisconnect:
                raise
            except Exception as exc:
                await websocket.send_json(
                    {"type": "error", "detail": str(exc)},
                )
    except WebSocketDisconnect:
        pass  # Client disconnected — nothing to clean up


# ---- Learning routes ----

learning_router = APIRouter(prefix="/v1/learning", tags=["learning"])


@learning_router.get("/stats")
async def learning_stats(request: Request):
    """Return learning system statistics across all sub-policies."""
    result: Dict[str, Any] = {}

    # Skill discovery
    try:
        from openjarvis.learning.agents.skill_discovery import SkillDiscovery

        discovery = SkillDiscovery()
        result["skill_discovery"] = {
            "available": True,
            "discovered_count": len(discovery.discovered_skills),
        }
    except Exception as exc:
        logger.warning("Failed to load skill discovery stats: %s", exc)
        result["skill_discovery"] = {"available": False}

    return result


@learning_router.get("/policy")
async def learning_policy(request: Request):
    """Return current routing policy configuration."""
    result: Dict[str, Any] = {}

    # Load config and extract learning section
    try:
        from openjarvis.core.config import load_config

        config = load_config()
        lc = config.learning
        result["enabled"] = lc.enabled
        result["update_interval"] = lc.update_interval
        result["auto_update"] = lc.auto_update
        result["routing"] = {
            "policy": lc.routing.policy,
            "min_samples": lc.routing.min_samples,
        }
        result["intelligence"] = {
            "policy": lc.intelligence.policy,
        }
        result["agent"] = {
            "policy": lc.agent.policy,
        }
        result["metrics"] = {
            "accuracy_weight": lc.metrics.accuracy_weight,
            "latency_weight": lc.metrics.latency_weight,
            "cost_weight": lc.metrics.cost_weight,
            "efficiency_weight": lc.metrics.efficiency_weight,
        }
    except Exception as exc:
        logger.warning("Failed to load learning config: %s", exc)
        result["enabled"] = False
        result["routing"] = {"policy": "heuristic", "min_samples": 5}
        result["intelligence"] = {"policy": "none"}
        result["agent"] = {"policy": "none"}
        result["metrics"] = {}

    return result


# ---- Speech routes ----

speech_router = APIRouter(prefix="/v1/speech", tags=["speech"])
voice_loop_router = APIRouter(prefix="/v1/voice-loop", tags=["voice-loop"])
workbench_router = APIRouter(prefix="/v1/workbench", tags=["workbench"])
action_center_router = APIRouter(prefix="/v1/action-center", tags=["action-center"])
operator_memory_router = APIRouter(prefix="/v1/operator-memory", tags=["operator-memory"])
automation_router = APIRouter(prefix="/v1/automation", tags=["automation"])


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

    # Detect format from filename
    filename = getattr(audio_file, "filename", "audio.wav")
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "wav"

    result = backend.transcribe(audio_bytes, format=ext, language=language or None)
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
    return {
        "available": backend.health(),
        "backend": backend.backend_id,
    }


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
        backend = backend_cls()
        result = backend.synthesize(
            text,
            voice_id=voice_id,
            speed=speed,
            output_format=req.output_format,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

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
    if manager is None:
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
            "wake_backend": "transcript",
            "last_vad_rms": 0.0,
            "last_wake_score": None,
            "last_transcript": "",
            "last_error": "Voice loop manager not configured",
        }
    return manager.status()


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
        raise HTTPException(status_code=500, detail=str(exc))


@workbench_router.get("/status")
async def workbench_status(request: Request):
    manager = getattr(request.app.state, "workbench", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Workbench manager not configured")
    return manager.status()


@workbench_router.post("/stage")
async def workbench_stage(req: WorkbenchStageRequest, request: Request):
    manager = getattr(request.app.state, "workbench", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Workbench manager not configured")
    try:
        return manager.stage(
            command=req.command,
            working_dir=req.working_dir,
            timeout=req.timeout,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@workbench_router.post("/approve")
async def workbench_approve(request: Request):
    manager = getattr(request.app.state, "workbench", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Workbench manager not configured")
    try:
        return await run_in_threadpool(manager.approve)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@workbench_router.post("/hold")
async def workbench_hold(request: Request):
    manager = getattr(request.app.state, "workbench", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Workbench manager not configured")
    return manager.hold()


@action_center_router.get("/status")
async def action_center_status(request: Request):
    manager = getattr(request.app.state, "action_center", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Action center not configured")
    return manager.status()


@action_center_router.post("/stage-email")
async def action_center_stage_email(req: ActionEmailDraftRequest, request: Request):
    manager = getattr(request.app.state, "action_center", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Action center not configured")
    try:
        return manager.stage_email_draft(
            recipient=req.recipient,
            subject=req.subject,
            body=req.body,
            provider=req.provider,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/stage-calendar")
async def action_center_stage_calendar(req: ActionCalendarBriefRequest, request: Request):
    manager = getattr(request.app.state, "action_center", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Action center not configured")
    try:
        return manager.stage_calendar_brief(
            title=req.title,
            start_at=req.start_at,
            end_at=req.end_at or "",
            attendees=req.attendees or "",
            location=req.location or "",
            notes=req.notes or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/stage-inbox-action")
async def action_center_stage_inbox_action(req: InboxActionStageRequest, request: Request):
    manager = getattr(request.app.state, "action_center", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Action center not configured")
    try:
        return manager.stage_inbox_action(
            action_kind=req.action_kind,
            source=req.source,
            message_id=req.message_id,
            title=req.title,
            author=req.author,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/stage-task")
async def action_center_stage_task(req: ActionTaskCreateRequest, request: Request):
    manager = getattr(request.app.state, "action_center", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Action center not configured")
    try:
        return manager.stage_task(
            title=req.title,
            notes=req.notes or "",
            due_at=req.due_at or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/approve")
async def action_center_approve(request: Request):
    manager = getattr(request.app.state, "action_center", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Action center not configured")
    try:
        return await run_in_threadpool(manager.approve)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@action_center_router.post("/hold")
async def action_center_hold(request: Request):
    manager = getattr(request.app.state, "action_center", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Action center not configured")
    return manager.hold()


@action_center_router.get("/inbox-summary")
async def action_center_inbox_summary(limit: int = 5):
    try:
        from openjarvis.connectors.store import KnowledgeStore

        store = KnowledgeStore()
        rows = store._conn.execute(
            """
            SELECT doc_id, thread_id, title, author, timestamp, content, source
            FROM knowledge_chunks
            WHERE doc_type = 'email' AND source IN ('gmail', 'gmail_imap', 'outlook')
            ORDER BY timestamp DESC, created_at DESC
            LIMIT ?
            """,
            (max(1, min(limit, 10)),),
        ).fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    items = []
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        key = (row["title"] or "", row["author"] or "", row["timestamp"] or "")
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "doc_id": row["doc_id"] or "",
                "thread_id": row["thread_id"] or "",
                "title": row["title"] or "(No subject)",
                "author": row["author"] or "Unknown sender",
                "author_email": parseaddr(row["author"] or "")[1],
                "timestamp": row["timestamp"] or "",
                "snippet": (row["content"] or "").strip()[:220],
                "source": row["source"] or "",
                "supports_mutation": (row["source"] or "") == "gmail" and str(row["doc_id"] or "").startswith("gmail:"),
            }
        )
    return {"items": items}


@action_center_router.get("/task-summary")
async def action_center_task_summary(limit: int = 6):
    try:
        from openjarvis.connectors.store import KnowledgeStore

        store = KnowledgeStore()
        rows = store._conn.execute(
            """
            SELECT title, timestamp, content, metadata, source
            FROM knowledge_chunks
            WHERE doc_type = 'task' AND source = 'google_tasks'
            ORDER BY timestamp DESC, created_at DESC
            LIMIT ?
            """,
            (max(1, min(limit, 12)),),
        ).fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    items = []
    for row in rows:
        try:
            metadata = json.loads(row["metadata"] or "{}")
        except Exception:
            metadata = {}
        items.append(
            {
                "title": row["title"] or "Untitled Task",
                "timestamp": row["timestamp"] or "",
                "notes": (row["content"] or "").strip()[:180],
                "status": metadata.get("status", ""),
                "due": metadata.get("due", ""),
                "source": row["source"] or "",
            }
        )
    return {"items": items}


@action_center_router.get("/reminders")
async def action_center_reminders(limit: int = 8):
    try:
        from openjarvis.connectors.store import KnowledgeStore

        store = KnowledgeStore()
        now = datetime.now(timezone.utc)
        upcoming_cutoff = (now + timedelta(hours=24)).isoformat()
        now_iso = now.isoformat()

        event_rows = store._conn.execute(
            """
            SELECT title, timestamp, content, source
            FROM knowledge_chunks
            WHERE doc_type = 'event'
              AND source = 'gcalendar'
              AND timestamp >= ?
              AND timestamp <= ?
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (now_iso, upcoming_cutoff, max(1, min(limit, 8))),
        ).fetchall()

        task_rows = store._conn.execute(
            """
            SELECT title, metadata, timestamp, source
            FROM knowledge_chunks
            WHERE doc_type = 'task'
              AND source = 'google_tasks'
            ORDER BY created_at DESC
            LIMIT 30
            """
        ).fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    items = []
    for row in event_rows:
        items.append(
            {
                "kind": "event",
                "title": row["title"] or "(No title)",
                "when": row["timestamp"] or "",
                "detail": ((row["content"] or "").splitlines()[1:2] or [""])[0],
                "source": row["source"] or "",
            }
        )

    for row in task_rows:
        try:
            metadata = json.loads(row["metadata"] or "{}")
        except Exception:
            metadata = {}
        status = metadata.get("status", "")
        due = metadata.get("due", "")
        if status == "completed" or not due:
            continue
        items.append(
            {
                "kind": "task",
                "title": row["title"] or "Untitled Task",
                "when": due,
                "detail": f"Status: {status or 'needsAction'}",
                "source": row["source"] or "",
            }
        )

    items.sort(key=lambda item: item.get("when", ""))
    return {"items": items[: max(1, min(limit, 10))]}


@operator_memory_router.get("")
async def operator_memory_status(request: Request):
    manager = getattr(request.app.state, "operator_memory", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Operator memory not configured")
    return manager.snapshot()


@operator_memory_router.post("/profile")
async def operator_memory_update_profile(req: OperatorProfileUpdateRequest, request: Request):
    manager = getattr(request.app.state, "operator_memory", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Operator memory not configured")
    return manager.update_profile(req.model_dump(exclude_none=True))


@operator_memory_router.post("/signal")
async def operator_memory_record_signal(req: OperatorSignalRequest, request: Request):
    manager = getattr(request.app.state, "operator_memory", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Operator memory not configured")
    try:
        return manager.record_signal(req.kind, req.contact or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/relationship")
async def operator_memory_update_relationship(
    req: OperatorRelationshipUpdateRequest,
    request: Request,
):
    manager = getattr(request.app.state, "operator_memory", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Operator memory not configured")
    try:
        return manager.update_relationship(req.contact, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@operator_memory_router.post("/meeting")
async def operator_memory_update_meeting(
    req: OperatorMeetingUpdateRequest,
    request: Request,
):
    manager = getattr(request.app.state, "operator_memory", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="Operator memory not configured")
    try:
        return manager.update_meeting(req.key, req.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _routine_defaults(routine_id: str, operator_memory: Any | None = None) -> dict[str, str]:
    snapshot = operator_memory.snapshot() if operator_memory is not None else {}
    profile = snapshot.get("profile", {}) if isinstance(snapshot, dict) else {}
    signals = snapshot.get("signals", {}) if isinstance(snapshot, dict) else {}
    relationships = snapshot.get("relationships", {}) if isinstance(snapshot, dict) else {}
    meetings = snapshot.get("meetings", {}) if isinstance(snapshot, dict) else {}

    honorific = str(profile.get("honorific", "sir")).strip() or "sir"
    reply_tone = str(profile.get("reply_tone", "clear and concise")).strip() or "clear and concise"
    priority_contacts = profile.get("priority_contacts", []) or []
    top_contacts = signals.get("top_contacts", []) or []

    contact_context = ", ".join([*priority_contacts[:5], *[c for c in top_contacts if c not in priority_contacts][:5]])
    relationship_notes = "; ".join(
        filter(
            None,
            [
                f"{value.get('name') or key}: {value.get('relationship') or 'known contact'} ({value.get('importance', 'normal')})"
                for key, value in list(relationships.items())[:5]
            ],
        )
    )
    meeting_notes = "; ".join(
        filter(
            None,
            [
                f"{value.get('title') or key}: {value.get('prep_style') or 'default prep'}"
                for key, value in list(meetings.items())[:5]
            ],
        )
    )

    prompts = {
        "daily_ops": (
            f"Generate a daily operations brief for {honorific}. "
            f"Use a {reply_tone} tone. Cover inbox priorities, upcoming meetings, and open tasks. "
            f"Prioritize these contacts when relevant: {contact_context or 'no saved contact priorities yet'}. "
            f"Known relationship context: {relationship_notes or 'none'}. "
            f"Known meeting context: {meeting_notes or 'none'}."
        ),
        "inbox_sweep": (
            f"Review connected inbox sources for {honorific}, highlight urgent threads first, and draft concise reply recommendations "
            f"using a {reply_tone} tone. Prioritize these contacts: {contact_context or 'no saved contact priorities yet'}. "
            f"Known relationship context: {relationship_notes or 'none'}."
        ),
        "meeting_prep": (
            f"Review upcoming calendar events for {honorific} and prepare concise meeting briefs with context, risks, and talking points. "
            f"Use saved prep patterns when possible. Known meeting context: {meeting_notes or 'none'}. "
            f"Important contacts to watch: {contact_context or 'no saved contact priorities yet'}."
        ),
    }
    crons = {
        "daily_ops": "0 8 * * *",
        "inbox_sweep": "0 9 * * *",
        "meeting_prep": "0 * * * *",
    }
    return {"prompt": prompts[routine_id], "cron": crons[routine_id]}


@automation_router.get("/status")
async def automation_status(request: Request):
    scheduler = getattr(request.app.state, "task_scheduler", None)
    if scheduler is None:
        return {"available": False, "items": []}
    items = []
    for task in scheduler.list_tasks():
        if not task.id.startswith("routine:"):
            continue
        items.append(
            {
                "routine_id": task.id.removeprefix("routine:"),
                "status": task.status,
                "next_run": task.next_run,
                "last_run": task.last_run,
                "cron": task.schedule_value,
                "agent": task.agent,
            }
        )
    return {"available": True, "items": items}


@automation_router.get("/logs")
async def automation_logs(request: Request, limit: int = 12):
    scheduler = getattr(request.app.state, "task_scheduler", None)
    scheduler_store = getattr(request.app.state, "task_scheduler_store", None)
    if scheduler is None or scheduler_store is None:
        return {"available": False, "items": []}

    items: list[dict[str, Any]] = []
    for task in scheduler.list_tasks():
        if not task.id.startswith("routine:"):
            continue
        for log in scheduler_store.get_run_logs(task.id, limit=max(1, min(limit, 5))):
            items.append(
                {
                    "routine_id": task.id.removeprefix("routine:"),
                    "task_id": task.id,
                    "started_at": log.get("started_at"),
                    "finished_at": log.get("finished_at"),
                    "success": bool(log.get("success")),
                    "result": log.get("result", ""),
                    "error": log.get("error", ""),
                }
            )
    items.sort(key=lambda item: item.get("started_at") or "", reverse=True)
    return {"available": True, "items": items[: max(1, min(limit, 25))]}


@automation_router.post("/routine")
async def automation_schedule_routine(req: RoutineScheduleRequest, request: Request):
    scheduler = getattr(request.app.state, "task_scheduler", None)
    if scheduler is None:
        raise HTTPException(status_code=503, detail="Task scheduler not available")

    defaults = _routine_defaults(
        req.routine_id,
        getattr(request.app.state, "operator_memory", None),
    )
    task_id = f"routine:{req.routine_id}"
    existing = {task.id: task for task in scheduler.list_tasks()}

    if req.enabled:
        cron = req.cron or defaults["cron"]
        if task_id in existing:
            task_dict = existing[task_id].to_dict()
            task_dict["status"] = "active"
            task_dict["schedule_type"] = "cron"
            task_dict["schedule_value"] = cron
            task_dict["prompt"] = defaults["prompt"]
            task_dict["agent"] = req.agent
            updated_task = existing[task_id].from_dict(task_dict)
            task_dict["next_run"] = scheduler._compute_next_run(updated_task)
            scheduler._store.save_task(task_dict)
        else:
            task = scheduler.create_task(
                prompt=defaults["prompt"],
                schedule_type="cron",
                schedule_value=cron,
                agent=req.agent,
                metadata={"routine_id": req.routine_id},
            )
            task_dict = task.to_dict()
            task_dict["id"] = task_id
            scheduler._store.save_task(task_dict)
    else:
        if task_id in existing:
            scheduler.cancel_task(task_id)

    return await automation_status(request)


# ---- Feedback routes ----

feedback_router = APIRouter(prefix="/v1/feedback", tags=["feedback"])


@feedback_router.post("")
async def submit_feedback(req: FeedbackScoreRequest, request: Request):
    """Submit feedback for a trace."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.traces.store import TraceStore

        db_path = DEFAULT_CONFIG_DIR / "traces.db"
        if not db_path.exists():
            raise HTTPException(status_code=404, detail="No trace database")

        store = TraceStore(db_path)
        updated = store.update_feedback(req.trace_id, req.score)
        store.close()

        if not updated:
            raise HTTPException(
                status_code=404, detail=f"Trace '{req.trace_id}' not found"
            )
        return {"status": "recorded", "trace_id": req.trace_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@feedback_router.get("/stats")
async def feedback_stats(request: Request):
    """Get feedback statistics."""
    return {"total": 0, "mean_score": 0.0}


# ---- Optimize routes ----

optimize_router = APIRouter(prefix="/v1/optimize", tags=["optimize"])


@optimize_router.get("/runs")
async def list_optimize_runs(request: Request):
    """List optimization runs."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.learning.optimize.store import OptimizationStore

        db_path = DEFAULT_CONFIG_DIR / "optimize.db"
        if not db_path.exists():
            return {"runs": []}

        store = OptimizationStore(db_path)
        runs = store.list_runs()
        store.close()
        return {"runs": runs}
    except Exception as exc:
        logger.warning("Failed to list optimization runs: %s", exc)
        return {"runs": []}


@optimize_router.get("/runs/{run_id}")
async def get_optimize_run(run_id: str, request: Request):
    """Get optimization run details."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.learning.optimize.store import OptimizationStore

        db_path = DEFAULT_CONFIG_DIR / "optimize.db"
        if not db_path.exists():
            return {"run_id": run_id, "status": "not_found"}

        store = OptimizationStore(db_path)
        run = store.get_run(run_id)
        store.close()

        if run is None:
            return {"run_id": run_id, "status": "not_found"}

        return {
            "run_id": run.run_id,
            "status": run.status,
            "benchmark": run.benchmark,
            "trials": len(run.trials),
            "best_trial_id": (run.best_trial.trial_id if run.best_trial else None),
        }
    except Exception as exc:
        logger.warning("Failed to get optimization run %s: %s", run_id, exc)
        return {"run_id": run_id, "status": "not_found"}


@optimize_router.post("/runs")
async def start_optimize_run(req: OptimizeRunRequest, request: Request):
    """Start a new optimization run."""
    return {"status": "started", "run_id": "placeholder"}


def include_all_routes(app) -> None:
    """Include all extended API routers in a FastAPI app."""
    app.include_router(agents_router)
    app.include_router(memory_router)
    app.include_router(traces_router)
    app.include_router(telemetry_router)
    app.include_router(skills_router)
    app.include_router(sessions_router)
    app.include_router(budget_router)
    app.include_router(metrics_router)
    app.include_router(websocket_router)
    app.include_router(learning_router)
    app.include_router(speech_router)
    app.include_router(voice_loop_router)
    app.include_router(workbench_router)
    app.include_router(action_center_router)
    app.include_router(operator_memory_router)
    app.include_router(automation_router)
    app.include_router(feedback_router)
    app.include_router(optimize_router)

    # Agent Manager routes (if available)
    try:
        if hasattr(app.state, "agent_manager") and app.state.agent_manager:
            from openjarvis.server.agent_manager_routes import (  # noqa: PLC0415
                create_agent_manager_router,
            )

            (
                agents_r,
                templates_r,
                global_r,
                tools_r,
                sendblue_r,
            ) = create_agent_manager_router(app.state.agent_manager)
            app.include_router(agents_r)
            app.include_router(templates_r)
            app.include_router(global_r)
            app.include_router(tools_r)
            app.include_router(sendblue_r)
    except ImportError:
        pass

    # WebSocket bridge for real-time agent events
    try:
        from openjarvis.core.events import get_event_bus
        from openjarvis.server.ws_bridge import create_ws_router

        ws_router = create_ws_router(get_event_bus())
        app.include_router(ws_router)
    except Exception:
        logger.debug("WebSocket bridge not available", exc_info=True)


__all__ = [
    "include_all_routes",
    "agents_router",
    "memory_router",
    "traces_router",
    "telemetry_router",
    "skills_router",
    "sessions_router",
    "budget_router",
    "metrics_router",
    "websocket_router",
    "learning_router",
    "speech_router",
    "voice_loop_router",
    "workbench_router",
    "action_center_router",
    "operator_memory_router",
    "automation_router",
    "feedback_router",
    "optimize_router",
]
