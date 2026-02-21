"""Tests for OpenHands agent."""

from __future__ import annotations

from unittest.mock import MagicMock

from openjarvis.agents._stubs import AgentContext
from openjarvis.agents.openhands import OpenHandsAgent
from openjarvis.core.events import EventBus, EventType
from openjarvis.core.registry import AgentRegistry
from openjarvis.core.types import Conversation, Message, Role, ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _CodeInterpreterStub(BaseTool):
    """Stub code_interpreter tool for testing."""

    tool_id = "code_interpreter"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="code_interpreter",
            description="Execute Python code.",
            parameters={
                "type": "object",
                "properties": {"code": {"type": "string"}},
                "required": ["code"],
            },
        )

    def execute(self, **params) -> ToolResult:
        code = params.get("code", "")
        # Simple simulation: if it contains print(), capture the content
        if "print(" in code:
            import re
            match = re.search(r"print\((.+?)\)", code)
            if match:
                try:
                    val = eval(match.group(1))  # noqa: S307
                    return ToolResult(
                        tool_name="code_interpreter",
                        content=str(val),
                        success=True,
                    )
                except Exception:
                    pass
        return ToolResult(
            tool_name="code_interpreter",
            content=f"Executed: {code}",
            success=True,
        )


class _CalculatorStub(BaseTool):
    tool_id = "calculator"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="calculator",
            description="Math calculator.",
            parameters={
                "type": "object",
                "properties": {"expression": {"type": "string"}},
                "required": ["expression"],
            },
        )

    def execute(self, **params) -> ToolResult:
        expr = params.get("expression", "0")
        try:
            val = eval(expr)  # noqa: S307
        except Exception as e:
            return ToolResult(tool_name="calculator", content=str(e), success=False)
        return ToolResult(tool_name="calculator", content=str(val), success=True)


def _engine_response(content, **extra):
    base = {
        "content": content,
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        "model": "test-model",
        "finish_reason": "stop",
    }
    base.update(extra)
    return base


# ---------------------------------------------------------------------------
# Registration tests
# ---------------------------------------------------------------------------


class TestOpenHandsRegistration:
    def test_registration(self):
        AgentRegistry.register_value("openhands", OpenHandsAgent)
        assert AgentRegistry.contains("openhands")

    def test_agent_id(self):
        engine = MagicMock()
        engine.engine_id = "mock"
        agent = OpenHandsAgent(engine, "test-model")
        assert agent.agent_id == "openhands"


# ---------------------------------------------------------------------------
# Agent execution tests
# ---------------------------------------------------------------------------


class TestOpenHandsAgent:
    def test_simple_response(self):
        """No code -> direct answer."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response("The answer is 42.")
        bus = EventBus(record_history=True)
        agent = OpenHandsAgent(engine, "test-model", bus=bus)
        result = agent.run("What is the meaning of life?")
        assert result.content == "The answer is 42."
        assert result.turns == 1
        assert result.tool_results == []

    def test_code_generation_execution(self):
        """Turn 1: returns code block -> code_interpreter executed. Turn 2: final."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.side_effect = [
            _engine_response(
                "Let me calculate:\n```python\nprint(2+2)\n```"
            ),
            _engine_response("The result is 4."),
        ]
        agent = OpenHandsAgent(
            engine, "test-model",
            tools=[_CodeInterpreterStub()],
        )
        result = agent.run("What is 2+2?")
        assert result.content == "The result is 4."
        assert result.turns == 2
        assert len(result.tool_results) == 1
        assert result.tool_results[0].tool_name == "code_interpreter"

    def test_multi_step_code(self):
        """Multiple code blocks across turns."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.side_effect = [
            _engine_response("Step 1:\n```python\nprint(1+1)\n```"),
            _engine_response("Step 2:\n```python\nprint(3*3)\n```"),
            _engine_response("First was 2, second was 9."),
        ]
        agent = OpenHandsAgent(
            engine, "test-model",
            tools=[_CodeInterpreterStub()],
        )
        result = agent.run("Two calculations")
        assert result.turns == 3
        assert len(result.tool_results) == 2
        assert result.content == "First was 2, second was 9."

    def test_max_turns(self):
        """Engine keeps generating code -> hits max_turns."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response(
            "More code:\n```python\nprint('hello')\n```"
        )
        agent = OpenHandsAgent(
            engine, "test-model",
            tools=[_CodeInterpreterStub()],
            max_turns=3,
        )
        result = agent.run("Keep coding")
        assert result.turns == 3
        assert result.metadata.get("max_turns_exceeded") is True

    def test_event_bus_emissions(self):
        """Verify AGENT_TURN_START, INFERENCE_START/END, AGENT_TURN_END events."""
        bus = EventBus(record_history=True)
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response("Direct answer.")
        agent = OpenHandsAgent(engine, "test-model", bus=bus)
        agent.run("Hello")
        event_types = [e.event_type for e in bus.history]
        assert EventType.AGENT_TURN_START in event_types
        assert EventType.INFERENCE_START in event_types
        assert EventType.INFERENCE_END in event_types
        assert EventType.AGENT_TURN_END in event_types

    def test_event_bus_tool_events(self):
        """Tool execution should trigger TOOL_CALL_START/END events."""
        bus = EventBus(record_history=True)
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.side_effect = [
            _engine_response("Code:\n```python\nprint(1)\n```"),
            _engine_response("Done."),
        ]
        agent = OpenHandsAgent(
            engine, "test-model",
            tools=[_CodeInterpreterStub()],
            bus=bus,
        )
        agent.run("Run code")
        event_types = [e.event_type for e in bus.history]
        assert EventType.TOOL_CALL_START in event_types
        assert EventType.TOOL_CALL_END in event_types

    def test_context_passing(self):
        """Pass AgentContext with conversation history."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response("Hello!")
        conv = Conversation()
        conv.add(Message(role=Role.USER, content="Previous"))
        conv.add(Message(role=Role.ASSISTANT, content="Previous response"))
        ctx = AgentContext(conversation=conv)
        agent = OpenHandsAgent(engine, "test-model")
        agent.run("Hello", context=ctx)
        call_args = engine.generate.call_args
        messages = call_args[0][0]
        # System prompt + 2 context + user input
        assert len(messages) == 4
        assert messages[0].role == Role.SYSTEM
        assert messages[1].content == "Previous"
        assert messages[3].content == "Hello"

    def test_tool_fallback(self):
        """Non-code tool use via Action: syntax."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.side_effect = [
            _engine_response(
                'Action: calculator\nAction Input: {"expression": "7*6"}'
            ),
            _engine_response("The answer is 42."),
        ]
        agent = OpenHandsAgent(
            engine, "test-model",
            tools=[_CalculatorStub()],
        )
        result = agent.run("What is 7 times 6?")
        assert result.content == "The answer is 42."
        assert result.turns == 2
        assert len(result.tool_results) == 1
        assert result.tool_results[0].tool_name == "calculator"
        assert result.tool_results[0].content == "42"

    def test_no_code_interpreter_tool(self):
        """Agent has code but no code_interpreter -> tool not found."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.side_effect = [
            _engine_response("```python\nprint(1)\n```"),
            _engine_response("Could not run code."),
        ]
        # No tools at all
        agent = OpenHandsAgent(engine, "test-model")
        result = agent.run("Run code")
        assert result.turns == 2
        assert len(result.tool_results) == 1
        assert result.tool_results[0].success is False
        assert "Unknown tool" in result.tool_results[0].content

    def test_no_bus_works(self):
        """Agent runs correctly without an event bus."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response("Works!")
        agent = OpenHandsAgent(engine, "test-model")
        result = agent.run("Hello")
        assert result.content == "Works!"

    def test_system_prompt_includes_tool_names(self):
        """System prompt should list available tool names."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response("Ok")
        agent = OpenHandsAgent(
            engine, "test-model",
            tools=[_CodeInterpreterStub(), _CalculatorStub()],
        )
        agent.run("Hello")
        call_args = engine.generate.call_args
        messages = call_args[0][0]
        system_msg = messages[0]
        assert "code_interpreter" in system_msg.content
        assert "calculator" in system_msg.content

    def test_max_turns_content_preserved(self):
        """When max turns exceeded, last content should be preserved."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response(
            "Still working:\n```python\nx = 1\n```"
        )
        agent = OpenHandsAgent(
            engine, "test-model",
            tools=[_CodeInterpreterStub()],
            max_turns=2,
        )
        result = agent.run("Loop")
        assert result.metadata.get("max_turns_exceeded") is True
        # Should have the last content, not the fallback message
        assert "Still working" in result.content

    def test_observation_appended_to_messages(self):
        """Code output is sent back to the engine as observation."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.side_effect = [
            _engine_response("```python\nprint(42)\n```"),
            _engine_response("Got 42."),
        ]
        agent = OpenHandsAgent(
            engine, "test-model",
            tools=[_CodeInterpreterStub()],
        )
        agent.run("Print 42")
        second_call = engine.generate.call_args_list[1]
        messages = second_call[0][0]
        last_msg = messages[-1]
        assert last_msg.role == Role.USER
        assert "Output:" in last_msg.content

    def test_event_data_agent_turn_start(self):
        """AGENT_TURN_START event data should include agent id and input."""
        bus = EventBus(record_history=True)
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response("Hi")
        agent = OpenHandsAgent(engine, "test-model", bus=bus)
        agent.run("test input")
        start_events = [
            e for e in bus.history
            if e.event_type == EventType.AGENT_TURN_START
        ]
        assert len(start_events) == 1
        assert start_events[0].data["agent"] == "openhands"
        assert start_events[0].data["input"] == "test input"

    def test_empty_input(self):
        """Agent handles empty input."""
        engine = MagicMock()
        engine.engine_id = "mock"
        engine.generate.return_value = _engine_response("Empty input received.")
        agent = OpenHandsAgent(engine, "test-model")
        result = agent.run("")
        assert result.content == "Empty input received."
