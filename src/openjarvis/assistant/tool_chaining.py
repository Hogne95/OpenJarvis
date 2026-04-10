"""Deterministic tool-chaining helpers for bounded JARVIS workflows."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable


ToolCallable = Callable[..., Any]


@dataclass(frozen=True)
class ToolChainStep:
    """One deterministic tool call inside a bounded workflow."""

    tool_name: str
    args: dict[str, Any] = field(default_factory=dict)
    label: str = ""
    continue_on_error: bool = False


@dataclass(frozen=True)
class ToolChainStepResult:
    tool_name: str
    label: str
    status: str
    output: Any = None
    error: str = ""


@dataclass(frozen=True)
class ToolChainResult:
    success: bool
    completed_steps: list[ToolChainStepResult]
    failed_step: ToolChainStepResult | None = None

    @property
    def partial(self) -> bool:
        return self.failed_step is not None and len(self.completed_steps) > 0


def execute_tool_chain(
    steps: list[ToolChainStep],
    tools: dict[str, ToolCallable],
) -> ToolChainResult:
    """Run a bounded sequence of tools with partial-result reporting.

    Root cause: JARVIS has strong individual tools, but higher-level workflows
    need a deterministic sequencing primitive that can stop safely, continue
    selectively, and report exactly where execution failed.
    """
    completed: list[ToolChainStepResult] = []
    failed: ToolChainStepResult | None = None

    for step in steps:
        tool = tools.get(step.tool_name)
        if tool is None:
            failed = ToolChainStepResult(
                tool_name=step.tool_name,
                label=step.label or step.tool_name,
                status="failed",
                error=f"Unknown tool: {step.tool_name}",
            )
            if not step.continue_on_error:
                break
            completed.append(failed)
            failed = None
            continue
        try:
            output = tool(**step.args)
            completed.append(
                ToolChainStepResult(
                    tool_name=step.tool_name,
                    label=step.label or step.tool_name,
                    status="completed",
                    output=output,
                )
            )
        except Exception as exc:
            step_failure = ToolChainStepResult(
                tool_name=step.tool_name,
                label=step.label or step.tool_name,
                status="failed",
                error=str(exc),
            )
            if step.continue_on_error:
                completed.append(step_failure)
                continue
            failed = step_failure
            break

    return ToolChainResult(
        success=failed is None,
        completed_steps=completed,
        failed_step=failed,
    )


__all__ = [
    "ToolChainResult",
    "ToolChainStep",
    "ToolChainStepResult",
    "execute_tool_chain",
]
