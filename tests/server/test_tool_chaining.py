from __future__ import annotations

from openjarvis.assistant.tool_chaining import ToolChainStep, execute_tool_chain


def test_execute_tool_chain_runs_steps_in_order():
    seen: list[str] = []

    def first(value: int) -> int:
        seen.append("first")
        return value + 1

    def second(value: int) -> int:
        seen.append("second")
        return value * 2

    result = execute_tool_chain(
        [
            ToolChainStep("first", {"value": 2}, label="Gather"),
            ToolChainStep("second", {"value": 3}, label="Summarize"),
        ],
        {"first": first, "second": second},
    )

    assert result.success is True
    assert seen == ["first", "second"]
    assert [step.label for step in result.completed_steps] == ["Gather", "Summarize"]


def test_execute_tool_chain_returns_partial_result_on_failure():
    def okay() -> str:
        return "ok"

    def broken() -> str:
        raise RuntimeError("boom")

    result = execute_tool_chain(
        [
            ToolChainStep("okay"),
            ToolChainStep("broken"),
        ],
        {"okay": okay, "broken": broken},
    )

    assert result.success is False
    assert result.partial is True
    assert len(result.completed_steps) == 1
    assert result.failed_step is not None
    assert result.failed_step.error == "boom"


def test_execute_tool_chain_can_continue_on_error():
    seen: list[str] = []

    def broken() -> str:
        seen.append("broken")
        raise RuntimeError("skip me")

    def later() -> str:
        seen.append("later")
        return "done"

    result = execute_tool_chain(
        [
            ToolChainStep("broken", continue_on_error=True),
            ToolChainStep("later"),
        ],
        {"broken": broken, "later": later},
    )

    assert result.success is True
    assert seen == ["broken", "later"]
    assert result.completed_steps[0].status == "failed"
    assert result.completed_steps[1].output == "done"
