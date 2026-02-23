"""OrchestratorAgent — multi-turn agent with tool-calling loop.

Supports two modes:

- **function_calling** (default): Uses OpenAI-format tool definitions and
  parses ``tool_calls`` from the engine response.
- **structured**: Uses a THOUGHT/TOOL/INPUT/FINAL_ANSWER text format
  (like ReAct) with a canonical system prompt from the orchestrator
  prompt registry.  This is the format used by the SFT/GRPO training
  pipelines, making the Orchestrator a distinctive trainable agent type.
"""

from __future__ import annotations

import re
from typing import Any, List, Optional

from openjarvis.agents._stubs import AgentContext, AgentResult, BaseAgent
from openjarvis.core.events import EventBus, EventType
from openjarvis.core.registry import AgentRegistry
from openjarvis.core.types import Message, Role, ToolCall, ToolResult
from openjarvis.engine._stubs import InferenceEngine
from openjarvis.tools._stubs import BaseTool, ToolExecutor


@AgentRegistry.register("orchestrator")
class OrchestratorAgent(BaseAgent):
    """Multi-turn agent that routes between tools and the LLM.

    Implements a tool-calling loop:
    1. Send messages with tool definitions to the engine.
    2. If the response contains tool_calls, execute them and loop.
    3. If no tool_calls, return the final answer.
    4. Stop after ``max_turns`` iterations.

    In **structured** mode the agent instead uses a
    ``THOUGHT: / TOOL: / INPUT: / FINAL_ANSWER:`` text protocol
    identical to the format used by the orchestrator SFT/GRPO
    training pipelines.
    """

    agent_id = "orchestrator"

    def __init__(
        self,
        engine: InferenceEngine,
        model: str,
        *,
        tools: Optional[List[BaseTool]] = None,
        bus: Optional[EventBus] = None,
        max_turns: int = 10,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        mode: str = "function_calling",
        system_prompt: Optional[str] = None,
    ) -> None:
        self._engine = engine
        self._model = model
        self._tools = tools or []
        self._executor = ToolExecutor(self._tools, bus=bus)
        self._bus = bus
        self._max_turns = max_turns
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._mode = mode
        self._system_prompt = system_prompt

    def run(
        self,
        input: str,
        context: Optional[AgentContext] = None,
        **kwargs: Any,
    ) -> AgentResult:
        if self._mode == "structured":
            return self._run_structured(input, context, **kwargs)
        return self._run_function_calling(input, context, **kwargs)

    # ------------------------------------------------------------------
    # Structured mode (THOUGHT/TOOL/INPUT/FINAL_ANSWER)
    # ------------------------------------------------------------------

    def _run_structured(
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

        # Build system prompt
        if self._system_prompt:
            sys_prompt = self._system_prompt
        else:
            from openjarvis.learning.orchestrator.prompt_registry import (
                build_system_prompt,
            )
            tool_names = [t.spec.name for t in self._tools]
            sys_prompt = build_system_prompt(tool_names)

        messages: list[Message] = [
            Message(role=Role.SYSTEM, content=sys_prompt),
        ]
        if context and context.conversation.messages:
            messages.extend(context.conversation.messages)
        messages.append(Message(role=Role.USER, content=input))

        all_tool_results: list[ToolResult] = []
        turns = 0

        for _turn in range(self._max_turns):
            turns += 1

            result = self._engine.generate(
                messages,
                model=self._model,
                temperature=self._temperature,
                max_tokens=self._max_tokens,
            )
            content = result.get("content", "")

            parsed = self._parse_structured_response(content)

            # FINAL_ANSWER → done
            if parsed["final_answer"]:
                if bus:
                    bus.publish(
                        EventType.AGENT_TURN_END,
                        {"agent": self.agent_id, "turns": turns},
                    )
                return AgentResult(
                    content=parsed["final_answer"],
                    tool_results=all_tool_results,
                    turns=turns,
                )

            # TOOL → execute
            if parsed["tool"]:
                messages.append(
                    Message(role=Role.ASSISTANT, content=content)
                )

                tool_call = ToolCall(
                    id=f"orch_{turns}",
                    name=parsed["tool"],
                    arguments=parsed["input"] or "{}",
                )
                tool_result = self._executor.execute(tool_call)
                all_tool_results.append(tool_result)

                observation = (
                    f"Observation: {tool_result.content}"
                )
                messages.append(
                    Message(role=Role.USER, content=observation)
                )
                continue

            # Neither → treat content as final answer
            if bus:
                bus.publish(
                    EventType.AGENT_TURN_END,
                    {"agent": self.agent_id, "turns": turns},
                )
            return AgentResult(
                content=content,
                tool_results=all_tool_results,
                turns=turns,
            )

        # Max turns exceeded
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
            content="Maximum turns reached without a final answer.",
            tool_results=all_tool_results,
            turns=turns,
            metadata={"max_turns_exceeded": True},
        )

    @staticmethod
    def _parse_structured_response(text: str) -> dict:
        """Parse THOUGHT/TOOL/INPUT/FINAL_ANSWER from model output."""
        result = {
            "thought": "",
            "tool": "",
            "input": "",
            "final_answer": "",
        }

        thought_match = re.search(
            r"THOUGHT:\s*(.+?)(?=\nTOOL:|\nFINAL[_ ]?ANSWER:|\Z)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if thought_match:
            result["thought"] = thought_match.group(1).strip()

        final_match = re.search(
            r"FINAL[_ ]?ANSWER:\s*(.+)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if final_match:
            result["final_answer"] = final_match.group(1).strip()
            return result

        tool_match = re.search(
            r"TOOL:\s*(.+)", text, re.IGNORECASE
        )
        if tool_match:
            result["tool"] = tool_match.group(1).strip()

        input_match = re.search(
            r"INPUT:\s*(.+?)(?=\nTHOUGHT:|\nTOOL:|\nFINAL|\Z)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if input_match:
            result["input"] = input_match.group(1).strip()

        return result

    # ------------------------------------------------------------------
    # Function-calling mode (original behaviour)
    # ------------------------------------------------------------------

    def _run_function_calling(
        self,
        input: str,
        context: Optional[AgentContext] = None,
        **kwargs: Any,
    ) -> AgentResult:
        bus = self._bus

        # Emit agent start
        if bus:
            bus.publish(EventType.AGENT_TURN_START, {
                "agent": self.agent_id,
                "input": input,
            })

        # Build initial messages
        messages: list[Message] = []
        if context and context.conversation.messages:
            messages.extend(context.conversation.messages)
        messages.append(Message(role=Role.USER, content=input))

        # Get OpenAI-format tool definitions
        openai_tools = self._executor.get_openai_tools() if self._tools else []

        all_tool_results: list[ToolResult] = []
        turns = 0

        for _turn in range(self._max_turns):
            turns += 1

            # Build generate kwargs
            gen_kwargs: dict[str, Any] = {}
            if openai_tools:
                gen_kwargs["tools"] = openai_tools

            result = self._engine.generate(
                messages,
                model=self._model,
                temperature=self._temperature,
                max_tokens=self._max_tokens,
                **gen_kwargs,
            )

            content = result.get("content", "")
            raw_tool_calls = result.get("tool_calls", [])

            # No tool calls → final answer
            if not raw_tool_calls:
                if bus:
                    bus.publish(EventType.AGENT_TURN_END, {
                        "agent": self.agent_id,
                        "turns": turns,
                        "content_length": len(content),
                    })
                return AgentResult(
                    content=content,
                    tool_results=all_tool_results,
                    turns=turns,
                )

            # Build ToolCall objects from raw dicts
            tool_calls = [
                ToolCall(
                    id=tc.get("id", f"call_{i}"),
                    name=tc.get("name", ""),
                    arguments=tc.get("arguments", "{}"),
                )
                for i, tc in enumerate(raw_tool_calls)
            ]

            # Append assistant message with tool calls
            messages.append(Message(
                role=Role.ASSISTANT,
                content=content,
                tool_calls=tool_calls,
            ))

            # Execute each tool and append results
            for tc in tool_calls:
                tool_result = self._executor.execute(tc)
                all_tool_results.append(tool_result)

                # Append tool response message
                messages.append(Message(
                    role=Role.TOOL,
                    content=tool_result.content,
                    tool_call_id=tc.id,
                    name=tc.name,
                ))

        # Max turns exceeded
        if bus:
            bus.publish(EventType.AGENT_TURN_END, {
                "agent": self.agent_id,
                "turns": turns,
                "max_turns_exceeded": True,
            })

        # Try to provide last content or a warning
        final_content = content if content else (
            "Maximum turns reached without a final answer."
        )
        return AgentResult(
            content=final_content,
            tool_results=all_tool_results,
            turns=turns,
            metadata={"max_turns_exceeded": True},
        )


__all__ = ["OrchestratorAgent"]
