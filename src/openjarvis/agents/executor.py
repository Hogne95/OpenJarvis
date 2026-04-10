"""AgentExecutor — runs a single agent tick."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

from openjarvis.agents._stubs import AgentResult
from openjarvis.agents.errors import (
    AgentTickError,
    EscalateError,
    FatalError,
    classify_error,
    retry_delay,
)
from openjarvis.core.events import EventBus, EventType

if TYPE_CHECKING:
    from openjarvis.agents.manager import AgentManager

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_STEP_HISTORY_LIMIT = 12


class AgentExecutor:
    """Executes a single tick for a managed agent.

    Constructor receives a JarvisSystem reference for access to engine,
    tools, config, memory backends, and all other primitives.
    """

    def __init__(
        self,
        manager: AgentManager,
        event_bus: EventBus,
        system: Any = None,
        trace_store: Any = None,
    ) -> None:
        self._system = system
        self._manager = manager
        self._bus = event_bus
        self._trace_store = trace_store

    def set_system(self, system: Any) -> None:
        """Deferred system injection — called after JarvisSystem is constructed."""
        self._system = system

    def _set_activity(self, agent_id: str, activity: str) -> None:
        """Update the agent's current_activity for progress visibility."""
        try:
            self._manager.update_agent(agent_id, current_activity=activity)
        except Exception:
            pass  # Non-critical

    def _primary_task(self, agent_id: str) -> dict[str, Any] | None:
        """Return the most relevant visible task for progress tracking."""
        try:
            tasks = self._manager.list_tasks(agent_id)
        except Exception:
            return None
        for status in ("active", "pending"):
            task = next((item for item in tasks if item.get("status") == status), None)
            if task is not None:
                return task
        return tasks[0] if tasks else None

    def _record_execution_step(
        self,
        agent_id: str,
        *,
        phase: str,
        status: str,
        detail: str,
        retry_state: dict[str, Any] | None = None,
        result_summary: str = "",
        task_status: str | None = None,
    ) -> None:
        """Persist a structured execution step and publish it for observers.

        Root cause: managed agents already emitted raw lifecycle events, but not
        a normalized plan/execute/verify/report view that the HUD or logs could
        reliably surface. Recording bounded execution steps on the existing task
        model keeps the work observable without layering on a second executor.
        """
        now = time.time()
        task = self._primary_task(agent_id)
        self._set_activity(agent_id, detail)

        if task is not None:
            progress = dict(task.get("progress") or {})
            history = list(progress.get("steps") or [])
            step_entry = {
                "phase": phase,
                "status": status,
                "detail": detail,
                "timestamp": now,
            }
            if retry_state:
                step_entry["retry_state"] = retry_state
            if result_summary:
                step_entry["result_summary"] = result_summary
            history.append(step_entry)
            progress.update(
                {
                    "current_step": phase,
                    "step_status": status,
                    "current_detail": detail,
                    "updated_at": now,
                    "steps": history[-_STEP_HISTORY_LIMIT:],
                }
            )
            if retry_state:
                progress["retry_state"] = retry_state
            if result_summary:
                progress["result_summary"] = result_summary
            next_task_status = task_status
            if next_task_status is None and task.get("status") == "pending" and status in {
                "running",
                "retrying",
            }:
                next_task_status = "active"
            kwargs: dict[str, Any] = {"progress": progress}
            if next_task_status:
                kwargs["status"] = next_task_status
            try:
                self._manager.update_task(str(task.get("id")), **kwargs)
            except Exception:
                pass

        payload: dict[str, Any] = {
            "agent_id": agent_id,
            "phase": phase,
            "status": status,
            "detail": detail,
            "timestamp": now,
        }
        if task is not None:
            payload["task_id"] = task.get("id")
        if retry_state:
            payload["retry_state"] = retry_state
        if result_summary:
            payload["result_summary"] = result_summary
        self._bus.publish(EventType.TRACE_STEP, payload)

    def _resolve_operator_memory(self, agent: dict[str, Any]) -> Any | None:
        """Resolve the best operator-memory target for self-improvement signals.

        Root cause: agent failures were already observable in traces and HUD status,
        but they were not automatically feeding the review loop. Resolving the
        agent owner's operator memory lets JARVIS learn from repeated failures
        without leaking one user's issues into another user's memory.
        """
        owner_user_id = str(agent.get("owner_user_id") or "").strip()
        system = self._system
        if system is not None and owner_user_id:
            cache = getattr(system, "_operator_memory_by_user_id", None)
            if isinstance(cache, dict):
                cached = cache.get(owner_user_id)
                if cached is not None:
                    return cached
        if system is not None:
            fallback = getattr(system, "operator_memory", None)
            if fallback is not None:
                return fallback
        if not owner_user_id:
            return None
        try:
            from openjarvis.core.config import DEFAULT_CONFIG_DIR
            from openjarvis.server.operator_memory import OperatorMemory
        except Exception:
            return None
        scoped_dir = Path(DEFAULT_CONFIG_DIR) / "operator_memory"
        scoped_dir.mkdir(parents=True, exist_ok=True)
        manager = OperatorMemory(path=str(scoped_dir / f"{owner_user_id}.json"))
        if system is not None:
            cache = getattr(system, "_operator_memory_by_user_id", None)
            if cache is None:
                cache = {}
                setattr(system, "_operator_memory_by_user_id", cache)
            if isinstance(cache, dict):
                cache[owner_user_id] = manager
        return manager

    def _record_failure_review_item(self, agent: dict[str, Any], *, error: Exception, category: str) -> None:
        manager = self._resolve_operator_memory(agent)
        if manager is None or not hasattr(manager, "add_review_item"):
            return
        agent_name = str(agent.get("name") or "Managed agent").strip() or "Managed agent"
        activity = str(agent.get("current_activity") or "").strip()
        summary = f"{agent_name} hit a {category.replace('_', ' ')} condition."
        detail = f"Error: {str(error).strip() or 'unknown'}"
        if activity:
            detail += f"\nLast activity: {activity}"
        try:
            manager.add_review_item(
                category=category,
                label=agent_name,
                summary=summary,
                detail=detail,
                source="agent-executor",
                status="open",
            )
        except Exception:
            pass

    def _inject_tool_deps(self, tool: Any) -> None:
        """Inject runtime dependencies into a tool instance.

        Mirrors SystemBuilder._inject_tool_deps (system.py:920-945)
        but uses the lightweight system's references.
        """
        if self._system is None:
            return
        name = getattr(getattr(tool, "spec", None), "name", "")
        if name == "llm":
            if hasattr(tool, "_engine"):
                tool._engine = self._system.engine
            if hasattr(tool, "_model"):
                tool._model = self._system.model
        elif name == "retrieval" or name.startswith("memory_"):
            if hasattr(tool, "_backend"):
                tool._backend = getattr(self._system, "memory_backend", None)
        elif name.startswith("channel_"):
            if hasattr(tool, "_channel"):
                tool._channel = getattr(self._system, "channel_backend", None)

    @staticmethod
    def _normalize_managed_agent_config(agent: dict, config: dict[str, Any]) -> dict[str, Any]:
        """Apply compatibility fixes for known managed-agent products.

        Root cause: some older managed-agent templates, especially the inbox
        triager, were built around the legacy channel backend tools. The HUD
        now relies more on connector-backed inbox data, so older agent configs
        need a runtime nudge toward connector-aware tools.
        """
        normalized = dict(config)
        agent_name = str(agent.get("name") or "")
        system_prompt = str(normalized.get("system_prompt") or "")
        is_inbox_triager = agent_name == "JARVIS Inbox Triager" or "Inbox Triager agent" in system_prompt
        if not is_inbox_triager:
            return normalized

        tools = normalized.get("tools", [])
        if isinstance(tools, str):
            tool_names = [item.strip() for item in tools.split(",") if item.strip()]
        elif isinstance(tools, list):
            tool_names = [str(item).strip() for item in tools if str(item).strip()]
        else:
            tool_names = []

        for tool_name in ("digest_collect", "memory_store", "memory_retrieve", "think", "web_search", "file_write"):
            if tool_name not in tool_names:
                tool_names.append(tool_name)
        normalized["tools"] = tool_names

        instruction = str(normalized.get("instruction") or "").strip()
        runtime_instruction = (
            "Primary inbox source is connector-backed data. Start with "
            "digest_collect using likely message connectors such as gmail, "
            "gmail_imap, outlook, slack, imessage, whatsapp, and notion over "
            "the last 24-48 hours. Use channel_list or channel_send only when "
            "a legacy channel backend is actually available. If memory tools "
            "are unavailable, continue triage in degraded mode instead of "
            "claiming setup is incomplete."
        )
        if runtime_instruction not in instruction:
            normalized["instruction"] = f"{instruction}\n\n{runtime_instruction}".strip()

        if runtime_instruction not in system_prompt:
            normalized["system_prompt"] = (
                f"{system_prompt}\n\n## Runtime Override\n"
                f"{runtime_instruction}"
            ).strip()
        return normalized

    def run_ephemeral(
        self,
        agent_type: str,
        system_prompt: str,
        input_text: str,
        tools: list[str] | None = None,
    ) -> Any:
        """Run a one-shot agent turn with no lifecycle tracking."""
        from openjarvis.core.registry import AgentRegistry

        agent_cls = AgentRegistry.get(agent_type)
        agent = agent_cls(
            engine=getattr(self._manager, "_engine", None),
            system_prompt=system_prompt,
            bus=self._bus,
        )
        return agent.run(input_text)

    def execute_tick(self, agent_id: str, *, guard_acquired: bool = False) -> None:
        """Run one tick for the given agent.

        1. Acquire concurrency guard (start_tick)
        2. Invoke agent with retry logic
        3. Update stats
        4. Release guard (end_tick)
        """
        if not guard_acquired:
            try:
                self._manager.start_tick(agent_id)
            except ValueError:
                logger.warning("Agent %s already running, skipping tick", agent_id)
                return
        self._record_execution_step(
            agent_id,
            phase="plan",
            status="running",
            detail="Preparing tick...",
        )

        agent = self._manager.get_agent(agent_id)
        if agent is None:
            logger.error("Agent %s not found", agent_id)
            return

        self._bus.publish(
            EventType.AGENT_TICK_START,
            {
                "agent_id": agent_id,
                "agent_name": agent["name"],
            },
        )

        # Activity tracking: subscribe to tool/inference events
        def _on_activity(event: Any) -> None:
            if event.data.get("agent") == agent_id:
                self._manager.update_agent(agent_id, last_activity_at=time.time())

        self._bus.subscribe(EventType.TOOL_CALL_START, _on_activity)
        self._bus.subscribe(EventType.INFERENCE_START, _on_activity)

        # Trace recording: collect tool call steps
        trace_steps: list[dict[str, Any]] = []

        def _on_tool_start(event: Any) -> None:
            if event.data.get("agent") == agent_id:
                trace_steps.append(
                    {
                        "type": "tool_call",
                        "input": {
                            "tool": event.data.get("tool"),
                            "args": event.data.get("args"),
                        },
                        "start_time": event.timestamp,
                    }
                )

        def _on_tool_end(event: Any) -> None:
            if event.data.get("agent") == agent_id and trace_steps:
                for step in reversed(trace_steps):
                    if step["type"] == "tool_call" and "output" not in step:
                        step["output"] = {
                            "result": str(event.data.get("result", ""))[:4096],
                        }
                        step["duration"] = event.data.get("duration", 0)
                        break

        if self._trace_store:
            self._bus.subscribe(EventType.TOOL_CALL_START, _on_tool_start)
            self._bus.subscribe(EventType.TOOL_CALL_END, _on_tool_end)

        tick_start = time.time()
        result = None
        error_info = None

        try:
            result = self._run_with_retries(agent)
        except AgentTickError as e:
            error_info = e
        finally:
            self._bus.unsubscribe(EventType.TOOL_CALL_START, _on_activity)
            self._bus.unsubscribe(EventType.INFERENCE_START, _on_activity)

            if self._trace_store:
                self._bus.unsubscribe(EventType.TOOL_CALL_START, _on_tool_start)
                self._bus.unsubscribe(EventType.TOOL_CALL_END, _on_tool_end)

            tick_duration = time.time() - tick_start
            self._finalize_tick(agent_id, result, error_info, tick_duration)

            if self._trace_store:
                self._save_trace(
                    agent_id,
                    agent,
                    result,
                    error_info,
                    tick_start,
                    tick_duration,
                    trace_steps,
                )

    def _run_with_retries(self, agent: dict) -> AgentResult:
        """Invoke the agent, retrying on RetryableError up to _MAX_RETRIES."""
        last_error: AgentTickError | None = None

        for attempt in range(_MAX_RETRIES):
            try:
                return self._invoke_agent(agent)
            except AgentTickError as e:
                if not e.retryable or attempt == _MAX_RETRIES - 1:
                    raise
                last_error = e
                delay = retry_delay(attempt)
                self._record_execution_step(
                    agent["id"],
                    phase="execute",
                    status="retrying",
                    detail=f"Retrying after failure: {e}",
                    retry_state={
                        "attempt": attempt + 1,
                        "max_attempts": _MAX_RETRIES,
                        "delay_seconds": delay,
                    },
                )
                logger.info(
                    "Agent %s tick retry %d/%d in %ds: %s",
                    agent["id"],
                    attempt + 1,
                    _MAX_RETRIES,
                    delay,
                    e,
                )
                time.sleep(delay)
            except Exception as e:
                classified = classify_error(e)
                if not classified.retryable or attempt == _MAX_RETRIES - 1:
                    raise classified from e
                delay = retry_delay(attempt)
                self._record_execution_step(
                    agent["id"],
                    phase="execute",
                    status="retrying",
                    detail=f"Retrying after failure: {classified}",
                    retry_state={
                        "attempt": attempt + 1,
                        "max_attempts": _MAX_RETRIES,
                        "delay_seconds": delay,
                    },
                )
                logger.info(
                    "Agent %s tick retry %d/%d in %ds: %s",
                    agent["id"],
                    attempt + 1,
                    _MAX_RETRIES,
                    delay,
                    e,
                )
                time.sleep(delay)

        # Should not reach here, but just in case
        raise last_error or FatalError("max retries exhausted")

    def _invoke_agent(self, agent: dict) -> AgentResult:
        """Invoke the actual agent run. Tests mock this method."""
        from openjarvis.agents import AgentRegistry

        agent_type = agent.get("agent_type", "monitor_operative")
        agent_cls = AgentRegistry.get(agent_type)
        if agent_cls is None:
            raise FatalError(f"Unknown agent type: {agent_type}")

        config = self._normalize_managed_agent_config(agent, agent.get("config", {}))

        # Resolve engine + model from JarvisSystem
        engine = self._system.engine if self._system else None
        if engine is None:
            raise FatalError("No engine available in JarvisSystem")
        model = config.get("model") or (self._system.model if self._system else "")
        if not model:
            raise FatalError("No model configured for agent")

        logger.info(
            "Agent %s [%s]: using model=%s, engine=%s",
            agent["name"],
            agent["id"],
            model,
            type(engine).__name__,
        )
        self._record_execution_step(
            agent["id"],
            phase="plan",
            status="running",
            detail=f"Loading model {model}...",
        )

        # Optionally override model via router policy
        router_policy_key = config.get("router_policy")
        if router_policy_key and self._system:
            try:
                from openjarvis.core.registry import RouterPolicyRegistry
                from openjarvis.learning.routing.types import (
                    build_routing_context,
                )

                policy = RouterPolicyRegistry.create(
                    router_policy_key,
                    available_models=[model],
                )
                instruction = config.get("instruction", "")
                ctx = build_routing_context(instruction)
                selected = policy.select_model(ctx)
                if selected:
                    model = selected
            except Exception:
                pass  # Fall back to configured model

        # Resolve tools from config via ToolRegistry
        tool_names = config.get("tools", [])
        if isinstance(tool_names, str):
            tool_names = [t.strip() for t in tool_names.split(",") if t.strip()]

        tool_instances: list[Any] = []
        if tool_names:
            try:
                from openjarvis.server.agent_manager_routes import (
                    _ensure_registries_populated,
                )

                _ensure_registries_populated()
            except ImportError:
                pass
            from openjarvis.core.registry import ToolRegistry

            for tname in tool_names:
                if ToolRegistry.contains(tname):
                    try:
                        tool_cls = ToolRegistry.get(tname)
                        tool = tool_cls()
                        self._inject_tool_deps(tool)
                        tool_instances.append(tool)
                    except Exception:
                        logger.warning("Failed to instantiate tool %s", tname)
            if tool_instances:
                logger.info(
                    "Agent %s: resolved %d/%d tools",
                    agent["name"],
                    len(tool_instances),
                    len(tool_names),
                )

        # Construct agent instance
        agent_kwargs: dict[str, Any] = {}
        sys_prompt = config.get("system_prompt")
        if sys_prompt is not None:
            agent_kwargs["system_prompt"] = sys_prompt
        if getattr(agent_cls, "accepts_tools", False) and tool_instances:
            agent_kwargs["tools"] = tool_instances
        try:
            agent_instance = agent_cls(engine, model, **agent_kwargs)
        except TypeError:
            agent_instance = agent_cls(engine, model)

        # Build input from instruction + summary_memory + pending messages
        import datetime

        today = datetime.date.today().strftime("%A, %B %d, %Y")
        instruction = config.get("instruction", "")
        memory = agent.get("summary_memory", "")
        if instruction:
            input_text = f"Current date: {today}\n\nStanding instruction: {instruction}"
            if memory:
                input_text += f"\n\nPrevious context: {memory}"
        else:
            base = memory or "Continue your assigned task."
            input_text = f"Current date: {today}\n\n{base}"
        pending = self._manager.get_pending_messages(agent["id"])
        if pending:
            user_msgs = "\n".join(f"User: {m['content']}" for m in pending)
            input_text = f"{input_text}\n\nNew instructions:\n{user_msgs}"
            for m in pending:
                self._manager.mark_message_delivered(m["id"])
            logger.info(
                "Agent %s: delivering %d pending message(s)",
                agent["name"],
                len(pending),
            )
            self._record_execution_step(
                agent["id"],
                phase="execute",
                status="running",
                detail=f"Delivering {len(pending)} message(s)...",
            )
        else:
            logger.info(
                "Agent %s: no pending messages, running with instruction only",
                agent["name"],
            )

        # Build AgentContext with memory results from FTS5 backend
        from openjarvis.agents._stubs import AgentContext

        agent_ctx = AgentContext()
        memory_results = []

        if (
            self._system
            and getattr(self._system, "memory_backend", None)
            and getattr(self._system, "config", None)
            and self._system.config.agent.context_from_memory
        ):
            try:
                from openjarvis.tools.storage.context import (
                    ContextConfig,
                    format_context,
                )

                sys_cfg = self._system.config
                ctx_cfg = ContextConfig(
                    top_k=sys_cfg.memory.context_top_k,
                    min_score=sys_cfg.memory.context_min_score,
                    max_context_tokens=sys_cfg.memory.context_max_tokens,
                )
                # Use pending user messages as query, fall back to instruction
                query = ""
                if pending:
                    query = " ".join(m["content"] for m in pending)
                elif instruction:
                    query = instruction

                if query:
                    results = self._system.memory_backend.retrieve(
                        query,
                        top_k=ctx_cfg.top_k,
                    )
                    memory_results = [
                        r for r in results if r.score >= ctx_cfg.min_score
                    ]
                    if memory_results:
                        # Prepend retrieved context to input for agents
                        # that don't inspect AgentContext.memory_results
                        retrieved = format_context(memory_results)
                        input_text = (
                            f"Retrieved context from knowledge base:\n"
                            f"{retrieved}\n\n{input_text}"
                        )
            except Exception:
                pass  # Don't break agent tick if memory retrieval fails

        agent_ctx.memory_results = memory_results
        self._record_execution_step(
            agent["id"],
            phase="execute",
            status="running",
            detail="Generating response...",
        )
        logger.info(
            "Agent %s: calling agent.run() with %d chars input",
            agent["name"],
            len(input_text),
        )
        _t0 = time.time()
        result = agent_instance.run(input_text, context=agent_ctx)

        # Retry once if the model returned empty content (common with
        # Qwen3.5 thinking mode consuming all tokens).
        if not (result.content or "").strip():
            self._record_execution_step(
                agent["id"],
                phase="execute",
                status="retrying",
                detail="Retrying (empty response)...",
                retry_state={"attempt": 1, "max_attempts": 2, "reason": "empty_response"},
            )
            logger.warning(
                "Agent %s: empty content, retrying once",
                agent["name"],
            )
            result = agent_instance.run(input_text, context=agent_ctx)

        self._record_execution_step(
            agent["id"],
            phase="verify",
            status="running",
            detail="Verifying result...",
            result_summary=(result.content or "").strip()[:240],
        )

        _elapsed = time.time() - _t0
        logger.info(
            "Agent %s: agent.run() completed in %.1fs, "
            "content_len=%d, turns=%d, tokens=%s",
            agent["name"],
            _elapsed,
            len(result.content or ""),
            result.turns,
            result.metadata.get("total_tokens", "?"),
        )
        return result

    def _build_error_detail(self, error: AgentTickError) -> dict[str, Any]:
        """Build structured error detail for trace metadata."""
        import traceback

        from openjarvis.agents.errors import (
            EscalateError,
            FatalError,
            suggest_action,
        )

        if isinstance(error, EscalateError):
            error_type = "escalate"
        elif isinstance(error, FatalError):
            error_type = "fatal"
        else:
            error_type = "retryable"

        return {
            "error_type": error_type,
            "error_message": str(error)[:2000],
            "suggested_action": suggest_action(error),
            "stack_trace_summary": "".join(
                traceback.format_exception(type(error), error, error.__traceback__)[-3:]
            )[:1000]
            if error.__traceback__
            else "",
        }

    def _finalize_tick(
        self,
        agent_id: str,
        result: AgentResult | None,
        error: AgentTickError | None,
        duration: float,
    ) -> None:
        """Update agent state after tick completion or failure."""
        agent = self._manager.get_agent(agent_id) or {"id": agent_id, "name": "Managed agent"}
        self._record_execution_step(
            agent_id,
            phase="report",
            status="running",
            detail="Finalizing...",
        )
        if error is None:
            # Success
            logger.info(
                "Tick succeeded for agent %s in %.1fs, response_len=%d",
                agent_id,
                duration,
                len(result.content or "") if result else 0,
            )
            self._manager.end_tick(agent_id)
            self._manager.update_agent(agent_id, total_runs_increment=1)

            # Accumulate budget metrics from AgentResult metadata
            if result:
                tokens = (
                    result.metadata.get("total_tokens")
                    or result.metadata.get("tokens_used")
                    or 0
                )
                in_tokens = result.metadata.get("prompt_tokens", 0)
                out_tokens = result.metadata.get(
                    "completion_tokens",
                    0,
                )
                cost = result.metadata.get("cost", 0.0)
                budget_kwargs: dict[str, Any] = {"stall_retries": 0}
                if tokens > 0:
                    budget_kwargs["total_tokens_increment"] = tokens
                if in_tokens > 0:
                    budget_kwargs["input_tokens_increment"] = in_tokens
                if out_tokens > 0:
                    budget_kwargs["output_tokens_increment"] = out_tokens
                if cost > 0:
                    budget_kwargs["total_cost_increment"] = cost
                self._manager.update_agent(agent_id, **budget_kwargs)

                self._manager.update_summary_memory(
                    agent_id,
                    result.content[:2000],
                )
                self._manager.store_agent_response(agent_id, result.content[:2000])

            # Budget enforcement (post-tick check)
            agent_data = self._manager.get_agent(agent_id)
            if agent_data:
                config = agent_data.get("config", {})
                max_cost = config.get("max_cost", 0)
                max_tokens = config.get("max_tokens", 0)
                exceeded = False
                if max_cost > 0 and agent_data["total_cost"] > max_cost:
                    exceeded = True
                if max_tokens > 0 and agent_data["total_tokens"] > max_tokens:
                    exceeded = True
                if exceeded:
                    self._manager.update_agent(agent_id, status="budget_exceeded")
                    self._bus.publish(
                        EventType.AGENT_BUDGET_EXCEEDED,
                        {
                            "agent_id": agent_id,
                            "total_cost": agent_data["total_cost"],
                            "total_tokens": agent_data["total_tokens"],
                            "max_cost": max_cost,
                            "max_tokens": max_tokens,
                        },
                    )
            self._record_execution_step(
                agent_id,
                phase="report",
                status="success",
                detail="Completed tick successfully.",
                result_summary=(result.content or "").strip()[:240] if result else "",
                task_status="completed",
            )
            self._bus.publish(
                EventType.AGENT_TICK_END,
                {
                    "agent_id": agent_id,
                    "duration": duration,
                    "status": "ok",
                },
            )
        elif isinstance(error, EscalateError):
            logger.warning(
                "Tick escalated for agent %s after %.1fs: %s",
                agent_id,
                duration,
                error,
            )
            self._manager.end_tick(agent_id)
            self._manager.update_agent(agent_id, status="needs_attention")
            self._record_execution_step(
                agent_id,
                phase="report",
                status="blocked",
                detail=f"Needs attention: {error}",
                result_summary=str(error)[:240],
                task_status="failed",
            )
            self._bus.publish(
                EventType.AGENT_TICK_ERROR,
                {
                    "agent_id": agent_id,
                    "error": str(error),
                    "error_type": "escalate",
                    "duration": duration,
                },
            )
            self._record_failure_review_item(agent, error=error, category="agent_blocker")
        else:
            logger.error(
                "Tick failed for agent %s after %.1fs: %s",
                agent_id,
                duration,
                error,
                exc_info=error,
            )
            self._manager.end_tick(agent_id)
            self._manager.update_agent(agent_id, status="error")
            # Write error detail to summary_memory so frontend can display it
            error_msg = str(error)[:2000]
            self._manager.update_summary_memory(agent_id, f"ERROR: {error_msg}")
            self._record_execution_step(
                agent_id,
                phase="report",
                status="error",
                detail=f"Execution failed: {error}",
                result_summary=error_msg[:240],
                task_status="failed",
            )
            self._bus.publish(
                EventType.AGENT_TICK_ERROR,
                {
                    "agent_id": agent_id,
                    "error": str(error),
                    "error_type": (
                        "fatal"
                        if isinstance(error, FatalError)
                        else "retryable_exhausted"
                    ),
                    "duration": duration,
                },
            )
            self._record_failure_review_item(agent, error=error, category="agent_failure")

    def _save_trace(
        self,
        agent_id: str,
        agent: dict,
        result: AgentResult | None,
        error: AgentTickError | None,
        tick_start: float,
        tick_duration: float,
        trace_steps: list[dict[str, Any]],
    ) -> None:
        """Persist an execution trace to the trace store."""
        from openjarvis.core.types import StepType, Trace, TraceStep

        steps = []
        for s in trace_steps:
            steps.append(
                TraceStep(
                    step_type=(
                        StepType.TOOL_CALL
                        if s["type"] == "tool_call"
                        else StepType.GENERATE
                    ),
                    input=s.get("input", {}),
                    output=s.get("output", {}),
                    duration_seconds=s.get("duration", 0),
                    timestamp=s.get("start_time", tick_start),
                )
            )

        metadata: dict[str, Any] = {}
        if error is not None:
            metadata["error_detail"] = self._build_error_detail(error)

        outcome = "success" if error is None else "error"
        trace = Trace(
            agent=agent_id,
            query=agent.get("summary_memory", "")[:200],
            result=result.content[:200] if result else "",
            model=agent.get("config", {}).get("model", ""),
            outcome=outcome,
            steps=steps,
            started_at=tick_start,
            ended_at=tick_start + tick_duration,
            total_latency_seconds=tick_duration,
            metadata=metadata,
        )
        try:
            self._trace_store.save(trace)
        except Exception:
            logger.warning(
                "Failed to save trace for agent %s",
                agent_id,
                exc_info=True,
            )
