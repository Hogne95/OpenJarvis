"""OpenHandsAgent -- code-execution-centric agent."""

from __future__ import annotations

import json as _json
import re
from typing import Any, List, Optional

from openjarvis.agents._stubs import AgentContext, AgentResult, BaseAgent
from openjarvis.core.events import EventBus, EventType
from openjarvis.core.registry import AgentRegistry
from openjarvis.core.types import Message, Role, ToolCall, ToolResult
from openjarvis.engine._stubs import InferenceEngine
from openjarvis.telemetry.wrapper import instrumented_generate
from openjarvis.tools._stubs import BaseTool, ToolExecutor

OPENHANDS_SYSTEM_PROMPT = (
    "You are a CodeAct agent. To solve tasks, "
    "write Python code enclosed in ```python blocks.\n"
    "The code will be executed and you will see the output. "
    "You can iterate.\n"
    "If no code is needed, respond directly with your answer.\n"
    "Available tools: {tool_names}"
)


@AgentRegistry.register("openhands")
class OpenHandsAgent(BaseAgent):
    """OpenHands CodeAct agent -- generates and executes Python code."""

    agent_id = "openhands"

    def __init__(
        self,
        engine: InferenceEngine,
        model: str,
        *,
        tools: Optional[List[BaseTool]] = None,
        bus: Optional[EventBus] = None,
        max_turns: int = 15,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> None:
        self._engine = engine
        self._model = model
        self._tools = tools or []
        self._executor = ToolExecutor(self._tools, bus=bus)
        self._bus = bus
        self._max_turns = max_turns
        self._temperature = temperature
        self._max_tokens = max_tokens

    def _extract_code(self, text: str) -> str | None:
        """Extract Python code from markdown code blocks."""
        match = re.search(r"```python\n(.*?)```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        return None

    def _extract_tool_call(self, text: str) -> tuple[str, str] | None:
        """Extract tool call from structured output."""
        action_match = re.search(r"Action:\s*(.+)", text)
        input_match = re.search(
            r"Action Input:\s*(.+?)(?=\n\n|\Z)", text, re.DOTALL
        )
        if action_match:
            return (
                action_match.group(1).strip(),
                input_match.group(1).strip() if input_match else "{}",
            )
        return None

    def run(
        self,
        input: str,
        context: Optional[AgentContext] = None,
        **kwargs: Any,
    ) -> AgentResult:
        bus = self._bus

        if bus:
            bus.publish(
                EventType.AGENT_TURN_START,
                {"agent": self.agent_id, "input": input},
            )

        tool_names = (
            ", ".join(t.spec.name for t in self._tools) if self._tools else "none"
        )
        system_prompt = OPENHANDS_SYSTEM_PROMPT.format(tool_names=tool_names)

        messages: list[Message] = [Message(role=Role.SYSTEM, content=system_prompt)]
        if context and context.conversation.messages:
            messages.extend(context.conversation.messages)
        messages.append(Message(role=Role.USER, content=input))

        all_tool_results: list[ToolResult] = []
        turns = 0
        last_content = ""

        for _turn in range(self._max_turns):
            turns += 1

            if bus:
                result = instrumented_generate(
                    self._engine, messages, model=self._model,
                    bus=bus, temperature=self._temperature,
                    max_tokens=self._max_tokens,
                )
            else:
                result = self._engine.generate(
                    messages,
                    model=self._model,
                    temperature=self._temperature,
                    max_tokens=self._max_tokens,
                )

            content = result.get("content", "")
            last_content = content

            # Try to extract code
            code = self._extract_code(content)
            if code:
                messages.append(Message(role=Role.ASSISTANT, content=content))

                # Execute via code_interpreter tool if available
                tool_call = ToolCall(
                    id=f"code_{turns}",
                    name="code_interpreter",
                    arguments=_json.dumps({"code": code}),
                )
                tool_result = self._executor.execute(tool_call)
                all_tool_results.append(tool_result)

                observation = f"Output:\n{tool_result.content}"
                messages.append(Message(role=Role.USER, content=observation))
                continue

            # Try tool call
            tool_info = self._extract_tool_call(content)
            if tool_info:
                action, action_input = tool_info
                messages.append(Message(role=Role.ASSISTANT, content=content))

                tool_call = ToolCall(
                    id=f"tool_{turns}", name=action, arguments=action_input
                )
                tool_result = self._executor.execute(tool_call)
                all_tool_results.append(tool_result)

                observation = f"Result: {tool_result.content}"
                messages.append(Message(role=Role.USER, content=observation))
                continue

            # No code or tool call -- this is the final answer
            if bus:
                bus.publish(
                    EventType.AGENT_TURN_END,
                    {"agent": self.agent_id, "turns": turns},
                )
            return AgentResult(
                content=content, tool_results=all_tool_results, turns=turns
            )

        # Max turns
        if bus:
            bus.publish(
                EventType.AGENT_TURN_END,
                {
                    "agent": self.agent_id,
                    "turns": turns,
                    "max_turns_exceeded": True,
                },
            )

        return AgentResult(
            content=last_content or "Maximum turns reached.",
            tool_results=all_tool_results,
            turns=turns,
            metadata={"max_turns_exceeded": True},
        )


__all__ = ["OpenHandsAgent"]
