"""TraceAnalyzer — read-only query layer over stored traces.

Provides aggregated statistics that the learning system uses to update
routing policies, tool selection strategies, and memory configuration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from openjarvis.core.types import StepType, Trace, TraceStep
from openjarvis.traces.store import TraceStore


@dataclass(slots=True)
class RouteStats:
    """Aggregated statistics for a specific routing decision (model+agent)."""

    model: str
    agent: str
    count: int = 0
    avg_latency: float = 0.0
    avg_tokens: float = 0.0
    success_rate: float = 0.0
    avg_feedback: Optional[float] = None


@dataclass(slots=True)
class ToolStats:
    """Aggregated statistics for a specific tool."""

    tool_name: str
    call_count: int = 0
    avg_latency: float = 0.0
    success_rate: float = 0.0


@dataclass(slots=True)
class TraceSummary:
    """Overall summary statistics across all traces."""

    total_traces: int = 0
    total_steps: int = 0
    avg_steps_per_trace: float = 0.0
    avg_latency: float = 0.0
    avg_tokens: float = 0.0
    success_rate: float = 0.0
    step_type_distribution: Dict[str, int] = field(default_factory=dict)


class TraceAnalyzer:
    """Read-only query layer over a :class:`TraceStore`.

    Computes aggregated statistics from stored traces, providing the
    inputs that the learning system needs to update routing policies.
    """

    def __init__(self, store: TraceStore) -> None:
        self._store = store

    def summary(
        self,
        *,
        since: Optional[float] = None,
        until: Optional[float] = None,
    ) -> TraceSummary:
        """Compute an overall summary of all traces in the time range."""
        traces = self._store.list_traces(since=since, until=until, limit=10_000)
        if not traces:
            return TraceSummary()

        total_steps = sum(len(t.steps) for t in traces)
        evaluated = [t for t in traces if t.outcome is not None]
        successes = [t for t in evaluated if t.outcome == "success"]

        step_dist: Dict[str, int] = {}
        for t in traces:
            for s in t.steps:
                key = _step_type_str(s)
                step_dist[key] = step_dist.get(key, 0) + 1

        return TraceSummary(
            total_traces=len(traces),
            total_steps=total_steps,
            avg_steps_per_trace=total_steps / len(traces) if traces else 0.0,
            avg_latency=_avg([t.total_latency_seconds for t in traces]),
            avg_tokens=_avg([float(t.total_tokens) for t in traces]),
            success_rate=len(successes) / len(evaluated) if evaluated else 0.0,
            step_type_distribution=step_dist,
        )

    def per_route_stats(
        self,
        *,
        since: Optional[float] = None,
        until: Optional[float] = None,
    ) -> List[RouteStats]:
        """Compute stats grouped by (model, agent) routing decisions."""
        traces = self._store.list_traces(since=since, until=until, limit=10_000)
        groups: Dict[tuple, list[Trace]] = {}
        for t in traces:
            key = (t.model, t.agent)
            groups.setdefault(key, []).append(t)

        results = []
        for (model, agent), group in sorted(groups.items()):
            evaluated = [t for t in group if t.outcome is not None]
            successes = [t for t in evaluated if t.outcome == "success"]
            feedbacks = [t.feedback for t in group if t.feedback is not None]
            results.append(
                RouteStats(
                    model=model,
                    agent=agent,
                    count=len(group),
                    avg_latency=_avg([t.total_latency_seconds for t in group]),
                    avg_tokens=_avg([float(t.total_tokens) for t in group]),
                    success_rate=len(successes) / len(evaluated) if evaluated else 0.0,
                    avg_feedback=_avg(feedbacks) if feedbacks else None,
                )
            )
        return results

    def per_tool_stats(
        self,
        *,
        since: Optional[float] = None,
        until: Optional[float] = None,
    ) -> List[ToolStats]:
        """Compute stats grouped by tool name."""
        traces = self._store.list_traces(since=since, until=until, limit=10_000)
        tools: Dict[str, Dict[str, Any]] = {}
        for t in traces:
            for s in t.steps:
                stype = _step_type_str(s)
                if stype != "tool_call":
                    continue
                name = s.input.get("tool", "unknown")
                if name not in tools:
                    tools[name] = {"count": 0, "latencies": [], "successes": 0}
                tools[name]["count"] += 1
                tools[name]["latencies"].append(s.duration_seconds)
                if s.output.get("success"):
                    tools[name]["successes"] += 1

        return [
            ToolStats(
                tool_name=name,
                call_count=data["count"],
                avg_latency=_avg(data["latencies"]),
                success_rate=(
                    data["successes"] / data["count"]
                    if data["count"] else 0.0
                ),
            )
            for name, data in sorted(tools.items())
        ]

    def traces_for_query_type(
        self,
        *,
        has_code: bool = False,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        since: Optional[float] = None,
        until: Optional[float] = None,
    ) -> List[Trace]:
        """Retrieve traces matching query characteristics.

        Useful for the learning system to find traces similar to a new
        query and learn which routing decisions worked best.
        """
        traces = self._store.list_traces(since=since, until=until, limit=10_000)
        filtered = []
        for t in traces:
            if has_code and not _looks_like_code(t.query):
                continue
            if min_length is not None and len(t.query) < min_length:
                continue
            if max_length is not None and len(t.query) > max_length:
                continue
            filtered.append(t)
        return filtered

    def export_traces(
        self,
        *,
        since: Optional[float] = None,
        until: Optional[float] = None,
        limit: int = 1000,
    ) -> List[Dict[str, Any]]:
        """Export traces as plain dicts (for JSON serialization)."""
        traces = self._store.list_traces(since=since, until=until, limit=limit)
        return [_trace_to_dict(t) for t in traces]


# -- helpers -------------------------------------------------------------------


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _step_type_str(step: TraceStep) -> str:
    st = step.step_type
    return st.value if isinstance(st, StepType) else st


def _looks_like_code(text: str) -> bool:
    indicators = [
        "def ", "class ", "import ",
        "function ", "const ", "var ", "```",
    ]
    return any(ind in text for ind in indicators)


def _trace_to_dict(trace: Trace) -> Dict[str, Any]:
    return {
        "trace_id": trace.trace_id,
        "query": trace.query,
        "agent": trace.agent,
        "model": trace.model,
        "engine": trace.engine,
        "result": trace.result,
        "outcome": trace.outcome,
        "feedback": trace.feedback,
        "started_at": trace.started_at,
        "ended_at": trace.ended_at,
        "total_tokens": trace.total_tokens,
        "total_latency_seconds": trace.total_latency_seconds,
        "metadata": trace.metadata,
        "steps": [
            {
                "step_type": _step_type_str(s),
                "timestamp": s.timestamp,
                "duration_seconds": s.duration_seconds,
                "input": s.input,
                "output": s.output,
                "metadata": s.metadata,
            }
            for s in trace.steps
        ],
    }


__all__ = ["RouteStats", "ToolStats", "TraceAnalyzer", "TraceSummary"]
