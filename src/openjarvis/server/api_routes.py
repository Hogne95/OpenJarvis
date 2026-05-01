"""Extended API routes for agents, workflows, memory, traces, etc."""

from __future__ import annotations

import logging
from openjarvis.server.routes_action_center import action_center_router
from openjarvis.server.routes_agent_architecture import agent_architecture_router
from openjarvis.server.routes_agents_memory import agents_router, memory_router
from openjarvis.server.routes_automation import automation_router
from openjarvis.server.routes_feedback_optimize import feedback_router, optimize_router
from openjarvis.server.routes_learning import learning_router
from openjarvis.server.routes_metrics import metrics_router
from openjarvis.server.routes_operator_memory import operator_memory_router
from openjarvis.server.routes_skills_sessions_budget import (
    budget_router,
    sessions_router,
    skills_router,
)
from openjarvis.server.routes_shopify import shopify_router
from openjarvis.server.routes_speech_voice import speech_router, system_router, voice_loop_router
from openjarvis.server.routes_traces_telemetry import traces_router, telemetry_router
from openjarvis.server.routes_websocket import websocket_router
from openjarvis.server.routes_vision import vision_router
from openjarvis.server.routes_workbench_coding import coding_router, workbench_router
from openjarvis.server.routes_workspace import workspace_router

logger = logging.getLogger(__name__)


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
    app.include_router(system_router)
    app.include_router(speech_router)
    app.include_router(voice_loop_router)
    app.include_router(agent_architecture_router)
    app.include_router(workbench_router)
    app.include_router(action_center_router)
    app.include_router(operator_memory_router)
    app.include_router(vision_router)
    app.include_router(automation_router)
    app.include_router(workspace_router)
    app.include_router(coding_router)
    app.include_router(shopify_router)
    app.include_router(feedback_router)
    app.include_router(optimize_router)

    # Agent Manager routes (if available)
    try:
        if hasattr(app.state, "agent_manager") and app.state.agent_manager:
            from openjarvis.server.agent_manager_routes import (  # noqa: PLC0415
                create_agent_manager_router,
            )

            routers = create_agent_manager_router(app.state.agent_manager)
            agents_r = routers[0]
            templates_r = routers[1]
            global_r = routers[2]
            tools_r = routers[3]
            app.include_router(agents_r)
            app.include_router(templates_r)
            app.include_router(global_r)
            app.include_router(tools_r)
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
    "workspace_router",
    "coding_router",
    "shopify_router",
    "feedback_router",
    "optimize_router",
]
