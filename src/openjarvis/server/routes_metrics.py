from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)

metrics_router = APIRouter(tags=["metrics"])


@metrics_router.get("/metrics")
async def prometheus_metrics(request: Request):
    """Prometheus-compatible metrics endpoint."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator
        from starlette.responses import PlainTextResponse

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        lines = [
            "# HELP openjarvis_build_info Static OpenJarvis build information",
            "# TYPE openjarvis_build_info gauge",
            'openjarvis_build_info{version="0.1.0"} 1',
            "# HELP openjarvis_uptime_seconds Process uptime in seconds",
            "# TYPE openjarvis_uptime_seconds gauge",
            f"openjarvis_uptime_seconds {_metrics_uptime_seconds(request):.3f}",
            "# HELP openjarvis_voice_loop_active Whether the voice loop is active",
            "# TYPE openjarvis_voice_loop_active gauge",
            f"openjarvis_voice_loop_active {_metrics_voice_loop_active(request)}",
            "# HELP openjarvis_managed_agents_running Number of running managed agents",
            "# TYPE openjarvis_managed_agents_running gauge",
            f"openjarvis_managed_agents_running {_metrics_running_agents(request)}",
        ]

        if db_path.exists():
            agg = TelemetryAggregator(db_path)
            stats = agg.summary()
            lines.extend(
                [
                    "# HELP openjarvis_telemetry_calls_total Total inference calls recorded",
                    "# TYPE openjarvis_telemetry_calls_total counter",
                    f"openjarvis_telemetry_calls_total {stats.total_calls}",
                    "# HELP openjarvis_telemetry_tokens_total Total tokens recorded",
                    "# TYPE openjarvis_telemetry_tokens_total counter",
                    f"openjarvis_telemetry_tokens_total {stats.total_tokens}",
                    "# HELP openjarvis_telemetry_cost_usd_total Total estimated inference cost in USD",
                    "# TYPE openjarvis_telemetry_cost_usd_total counter",
                    f"openjarvis_telemetry_cost_usd_total {stats.total_cost:.6f}",
                    "# HELP openjarvis_telemetry_latency_seconds_total Total recorded inference latency in seconds",
                    "# TYPE openjarvis_telemetry_latency_seconds_total counter",
                    f"openjarvis_telemetry_latency_seconds_total {stats.total_latency:.6f}",
                    "# HELP openjarvis_telemetry_energy_joules_total Total recorded inference energy in joules",
                    "# TYPE openjarvis_telemetry_energy_joules_total counter",
                    f"openjarvis_telemetry_energy_joules_total {stats.total_energy_joules:.6f}",
                ]
            )

        return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain")
    except Exception as exc:
        logger.warning("Failed to collect Prometheus metrics: %s", exc)
        from starlette.responses import PlainTextResponse

        return PlainTextResponse("# No metrics available\n", media_type="text/plain")


def _metrics_uptime_seconds(request: Request) -> float:
    session_start = getattr(request.app.state, "session_start", None)
    if not isinstance(session_start, (int, float)):
        return 0.0
    return max(0.0, time.time() - float(session_start))


def _metrics_voice_loop_active(request: Request) -> int:
    voice_loop = getattr(request.app.state, "voice_loop", None)
    if voice_loop is None:
        return 0
    try:
        snapshot = voice_loop.snapshot() if hasattr(voice_loop, "snapshot") else voice_loop.status()
    except Exception:
        return 0
    active = snapshot.get("active") if isinstance(snapshot, dict) else None
    return 1 if active else 0


def _metrics_running_agents(request: Request) -> int:
    manager = getattr(request.app.state, "agent_manager", None)
    if manager is None:
        return 0
    try:
        agents = manager.list_agents()
    except Exception:
        return 0
    running = 0
    for agent in agents or []:
        status = str(agent.get("status", "")).strip().lower()
        if status == "running":
            running += 1
    return running
