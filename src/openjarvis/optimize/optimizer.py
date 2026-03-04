"""OptimizationEngine -- orchestrates the optimize loop.

Ties together the LLM optimizer, trial runner, and persistence store
into a single propose -> evaluate -> analyze -> repeat loop.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

try:
    import tomli_w
except ModuleNotFoundError:  # pragma: no cover
    tomli_w = None  # type: ignore[assignment]

from openjarvis.optimize.llm_optimizer import LLMOptimizer
from openjarvis.optimize.store import OptimizationStore
from openjarvis.optimize.trial_runner import TrialRunner
from openjarvis.optimize.types import (
    OptimizationRun,
    SearchSpace,
    TrialResult,
)

LOGGER = logging.getLogger(__name__)


class OptimizationEngine:
    """Orchestrates the optimize loop: propose -> evaluate -> analyze -> repeat."""

    def __init__(
        self,
        search_space: SearchSpace,
        llm_optimizer: LLMOptimizer,
        trial_runner: TrialRunner,
        store: Optional[OptimizationStore] = None,
        max_trials: int = 20,
        early_stop_patience: int = 5,
    ) -> None:
        self.search_space = search_space
        self.llm_optimizer = llm_optimizer
        self.trial_runner = trial_runner
        self.store = store
        self.max_trials = max_trials
        self.early_stop_patience = early_stop_patience

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(
        self,
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> OptimizationRun:
        """Execute the full optimization loop.

        1. Generate a run_id via uuid.
        2. ``llm_optimizer.propose_initial()`` -> first config.
        3. Loop up to ``max_trials``:
           a. ``trial_runner.run_trial(config)`` -> TrialResult
           b. ``llm_optimizer.analyze_trial(config, summary, traces)``
           c. Update TrialResult with analysis text
           d. Append to history
           e. If store, ``store.save_trial(result)``
           f. Update best_trial if accuracy improved
           g. Check early stopping (no improvement for *patience* trials)
           h. If not stopped, ``llm_optimizer.propose_next(history)``
        4. Set run status to ``"completed"``.
        5. If store, ``store.save_run(optimization_run)``.
        6. Return the :class:`OptimizationRun`.

        Args:
            progress_callback: Optional ``(trial_num, max_trials) -> None``
                called after each trial completes.
        """
        run_id = uuid.uuid4().hex[:16]
        optimization_run = OptimizationRun(
            run_id=run_id,
            search_space=self.search_space,
            status="running",
            optimizer_model=self.llm_optimizer.optimizer_model,
            benchmark=getattr(self.trial_runner, "benchmark", ""),
        )

        history: List[TrialResult] = []
        best_accuracy = -1.0
        trials_without_improvement = 0

        # First config
        config = self.llm_optimizer.propose_initial()

        for trial_num in range(1, self.max_trials + 1):
            LOGGER.info(
                "Trial %d/%d (id=%s)",
                trial_num,
                self.max_trials,
                config.trial_id,
            )

            # Evaluate
            result = self.trial_runner.run_trial(config)

            # Analyze
            if result.summary is not None:
                analysis = self.llm_optimizer.analyze_trial(
                    config,
                    result.summary,
                )
            else:
                analysis = ""
            result.analysis = analysis

            # Record
            history.append(result)
            optimization_run.trials.append(result)

            # Persist trial
            if self.store is not None:
                self.store.save_trial(run_id, result)

            # Track best
            if result.accuracy > best_accuracy:
                best_accuracy = result.accuracy
                optimization_run.best_trial = result
                trials_without_improvement = 0
            else:
                trials_without_improvement += 1

            # Progress callback
            if progress_callback is not None:
                progress_callback(trial_num, self.max_trials)

            # Early stopping
            if trials_without_improvement >= self.early_stop_patience:
                LOGGER.info(
                    "Early stopping after %d trials without improvement.",
                    self.early_stop_patience,
                )
                break

            # Propose next (unless this was the last trial)
            if trial_num < self.max_trials:
                config = self.llm_optimizer.propose_next(history)

        optimization_run.status = "completed"

        if self.store is not None:
            self.store.save_run(optimization_run)

        return optimization_run

    def export_best_recipe(
        self, run: OptimizationRun, path: Path
    ) -> Path:
        """Export the best trial's config as a TOML recipe file.

        Args:
            run: A completed :class:`OptimizationRun`.
            path: Destination path for the TOML file.

        Returns:
            The *path* written to.

        Raises:
            ValueError: If there is no best trial in the run.
        """
        if run.best_trial is None:
            raise ValueError("No best trial to export.")

        recipe_data = self._trial_to_recipe_dict(run.best_trial)
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        if tomli_w is not None:
            with open(path, "wb") as fh:
                tomli_w.dump(recipe_data, fh)
        else:
            # Fallback: write TOML manually
            self._write_toml_fallback(recipe_data, path)

        run.best_recipe_path = str(path)
        return path

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _trial_to_recipe_dict(trial: TrialResult) -> Dict[str, Any]:
        """Convert a TrialResult into a Recipe-style TOML dict."""
        params = trial.config.params
        recipe: Dict[str, Any] = {
            "recipe": {
                "name": f"optimized-{trial.trial_id}",
                "description": (
                    f"Auto-optimized config (accuracy={trial.accuracy:.4f})"
                ),
                "version": "1.0.0",
            },
        }

        # Intelligence section
        intel: Dict[str, Any] = {}
        if "intelligence.model" in params:
            intel["model"] = params["intelligence.model"]
        if "intelligence.temperature" in params:
            intel["temperature"] = params["intelligence.temperature"]
        if "intelligence.quantization" in params:
            intel["quantization"] = params["intelligence.quantization"]
        if "intelligence.system_prompt" in params:
            intel["system_prompt"] = params["intelligence.system_prompt"]
        if "intelligence.max_tokens" in params:
            intel["max_tokens"] = params["intelligence.max_tokens"]
        if "intelligence.top_p" in params:
            intel["top_p"] = params["intelligence.top_p"]
        if intel:
            recipe["intelligence"] = intel

        # Engine section
        engine: Dict[str, Any] = {}
        if "engine.backend" in params:
            engine["key"] = params["engine.backend"]
        if engine:
            recipe["engine"] = engine

        # Agent section
        agent: Dict[str, Any] = {}
        if "agent.type" in params:
            agent["type"] = params["agent.type"]
        if "agent.max_turns" in params:
            agent["max_turns"] = params["agent.max_turns"]
        if "agent.system_prompt" in params:
            agent["system_prompt"] = params["agent.system_prompt"]
        if "tools.tool_set" in params:
            agent["tools"] = params["tools.tool_set"]
        if agent:
            recipe["agent"] = agent

        # Learning section
        learning: Dict[str, Any] = {}
        if "learning.routing_policy" in params:
            learning["routing"] = params["learning.routing_policy"]
        if "learning.agent_policy" in params:
            learning["agent"] = params["learning.agent_policy"]
        if learning:
            recipe["learning"] = learning

        return recipe

    @staticmethod
    def _write_toml_fallback(
        data: Dict[str, Any], path: Path
    ) -> None:
        """Write a simple nested dict as TOML without tomli_w."""
        lines: List[str] = []
        for section, values in data.items():
            if not isinstance(values, dict):
                continue
            lines.append(f"[{section}]")
            for key, val in values.items():
                if isinstance(val, str):
                    lines.append(f'{key} = "{val}"')
                elif isinstance(val, bool):
                    lines.append(f"{key} = {'true' if val else 'false'}")
                elif isinstance(val, (int, float)):
                    lines.append(f"{key} = {val}")
                elif isinstance(val, list):
                    items = ", ".join(
                        f'"{v}"' if isinstance(v, str) else str(v)
                        for v in val
                    )
                    lines.append(f"{key} = [{items}]")
                else:
                    lines.append(f'{key} = "{val}"')
            lines.append("")
        path.write_text("\n".join(lines), encoding="utf-8")


__all__ = ["OptimizationEngine"]
