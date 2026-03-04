"""Tests for openjarvis.optimize.optimizer module."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib  # type: ignore[no-redef]

from openjarvis.evals.core.types import RunSummary
from openjarvis.optimize.optimizer import OptimizationEngine
from openjarvis.optimize.store import OptimizationStore
from openjarvis.optimize.types import (
    OptimizationRun,
    SearchDimension,
    SearchSpace,
    TrialConfig,
    TrialResult,
)


def _sample_search_space() -> SearchSpace:
    return SearchSpace(
        dimensions=[
            SearchDimension(
                name="agent.type",
                dim_type="categorical",
                values=["simple", "orchestrator"],
                pillar="agent",
            ),
            SearchDimension(
                name="intelligence.temperature",
                dim_type="continuous",
                low=0.0,
                high=1.0,
                pillar="intelligence",
            ),
        ],
        fixed={"engine": "ollama"},
    )


def _sample_summary(accuracy: float = 0.8) -> RunSummary:
    return RunSummary(
        benchmark="test",
        category="reasoning",
        backend="jarvis-direct",
        model="test-model",
        total_samples=50,
        scored_samples=50,
        correct=int(accuracy * 50),
        accuracy=accuracy,
        errors=0,
        mean_latency_seconds=1.0,
        total_cost_usd=0.01,
    )


def _sample_trial_result(
    trial_id: str = "t1",
    accuracy: float = 0.8,
    summary: RunSummary | None = None,
) -> TrialResult:
    config = TrialConfig(
        trial_id=trial_id,
        params={"agent.type": "orchestrator"},
        reasoning="test reasoning",
    )
    if summary is None:
        summary = _sample_summary(accuracy)
    return TrialResult(
        trial_id=trial_id,
        config=config,
        accuracy=accuracy,
        mean_latency_seconds=1.0,
        total_cost_usd=0.01,
        samples_evaluated=50,
        summary=summary,
    )


# ---------------------------------------------------------------------------
# __init__
# ---------------------------------------------------------------------------


class TestOptimizationEngineInit:
    """Tests for OptimizationEngine.__init__."""

    def test_stores_all_params(self) -> None:
        space = _sample_search_space()
        optimizer = MagicMock()
        runner = MagicMock()
        store = MagicMock()

        engine = OptimizationEngine(
            search_space=space,
            llm_optimizer=optimizer,
            trial_runner=runner,
            store=store,
            max_trials=10,
            early_stop_patience=3,
        )

        assert engine.search_space is space
        assert engine.llm_optimizer is optimizer
        assert engine.trial_runner is runner
        assert engine.store is store
        assert engine.max_trials == 10
        assert engine.early_stop_patience == 3

    def test_default_params(self) -> None:
        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=MagicMock(),
            trial_runner=MagicMock(),
        )
        assert engine.store is None
        assert engine.max_trials == 20
        assert engine.early_stop_patience == 5


# ---------------------------------------------------------------------------
# run() with mocked dependencies
# ---------------------------------------------------------------------------


class TestOptimizationEngineRun:
    """Tests for OptimizationEngine.run()."""

    def test_basic_run(self) -> None:
        space = _sample_search_space()
        optimizer = MagicMock()
        runner = MagicMock()

        initial_config = TrialConfig(
            trial_id="init",
            params={"agent.type": "orchestrator"},
        )
        second_config = TrialConfig(
            trial_id="next",
            params={"agent.type": "simple"},
        )
        optimizer.propose_initial.return_value = initial_config
        optimizer.propose_next.return_value = second_config
        optimizer.analyze_trial.return_value = "analysis text"
        optimizer.optimizer_model = "test-model"

        runner.run_trial.return_value = _sample_trial_result(
            "init", accuracy=0.8,
        )
        runner.benchmark = "supergpqa"

        engine = OptimizationEngine(
            search_space=space,
            llm_optimizer=optimizer,
            trial_runner=runner,
            max_trials=2,
        )

        # Make second trial return different accuracy
        runner.run_trial.side_effect = [
            _sample_trial_result("init", accuracy=0.8),
            _sample_trial_result("next", accuracy=0.85),
        ]

        result = engine.run()

        assert isinstance(result, OptimizationRun)
        assert result.status == "completed"
        assert len(result.trials) == 2
        assert result.best_trial is not None
        assert result.best_trial.accuracy == 0.85
        assert result.optimizer_model == "test-model"
        assert result.benchmark == "supergpqa"

        optimizer.propose_initial.assert_called_once()
        assert runner.run_trial.call_count == 2
        assert optimizer.analyze_trial.call_count == 2

    def test_single_trial(self) -> None:
        optimizer = MagicMock()
        runner = MagicMock()

        config = TrialConfig(trial_id="only", params={})
        optimizer.propose_initial.return_value = config
        optimizer.analyze_trial.return_value = "good"
        optimizer.optimizer_model = "m"
        runner.run_trial.return_value = _sample_trial_result("only", 0.9)
        runner.benchmark = "test"

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            max_trials=1,
        )
        result = engine.run()

        assert len(result.trials) == 1
        assert result.best_trial.accuracy == 0.9
        # propose_next should NOT be called when max_trials=1
        optimizer.propose_next.assert_not_called()

    def test_analysis_text_set_on_result(self) -> None:
        optimizer = MagicMock()
        runner = MagicMock()

        optimizer.propose_initial.return_value = TrialConfig(
            trial_id="t1", params={},
        )
        optimizer.analyze_trial.return_value = "detailed analysis"
        optimizer.optimizer_model = "m"
        runner.run_trial.return_value = _sample_trial_result("t1", 0.8)
        runner.benchmark = "b"

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            max_trials=1,
        )
        result = engine.run()

        assert result.trials[0].analysis == "detailed analysis"

    def test_run_without_summary_skips_analysis(self) -> None:
        """If trial result has no summary, analysis should be empty."""
        optimizer = MagicMock()
        runner = MagicMock()

        optimizer.propose_initial.return_value = TrialConfig(
            trial_id="t1", params={},
        )
        optimizer.optimizer_model = "m"

        # Result with no summary
        result_no_summary = TrialResult(
            trial_id="t1",
            config=TrialConfig(trial_id="t1", params={}),
            accuracy=0.5,
            summary=None,
        )
        runner.run_trial.return_value = result_no_summary
        runner.benchmark = "b"

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            max_trials=1,
        )
        run = engine.run()

        assert run.trials[0].analysis == ""
        optimizer.analyze_trial.assert_not_called()


# ---------------------------------------------------------------------------
# Early stopping
# ---------------------------------------------------------------------------


class TestEarlyStopping:
    """Tests for early stopping behavior."""

    def test_early_stop_after_patience(self) -> None:
        optimizer = MagicMock()
        runner = MagicMock()

        optimizer.propose_initial.return_value = TrialConfig(
            trial_id="t0", params={},
        )
        optimizer.propose_next.side_effect = [
            TrialConfig(trial_id=f"t{i}", params={})
            for i in range(1, 20)
        ]
        optimizer.analyze_trial.return_value = "ok"
        optimizer.optimizer_model = "m"
        runner.benchmark = "b"

        # First trial is the best; all subsequent are worse
        results = [_sample_trial_result("t0", accuracy=0.9)]
        for i in range(1, 20):
            results.append(_sample_trial_result(f"t{i}", accuracy=0.5))
        runner.run_trial.side_effect = results

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            max_trials=20,
            early_stop_patience=3,
        )
        run = engine.run()

        # Should stop after 1 (best) + 3 (patience) = 4 trials
        assert len(run.trials) == 4
        assert run.best_trial.trial_id == "t0"
        assert run.status == "completed"

    def test_no_early_stop_when_improving(self) -> None:
        optimizer = MagicMock()
        runner = MagicMock()

        optimizer.propose_initial.return_value = TrialConfig(
            trial_id="t0", params={},
        )
        optimizer.propose_next.side_effect = [
            TrialConfig(trial_id=f"t{i}", params={})
            for i in range(1, 5)
        ]
        optimizer.analyze_trial.return_value = "ok"
        optimizer.optimizer_model = "m"
        runner.benchmark = "b"

        # Accuracy keeps improving
        results = [
            _sample_trial_result("t0", accuracy=0.5),
            _sample_trial_result("t1", accuracy=0.6),
            _sample_trial_result("t2", accuracy=0.7),
            _sample_trial_result("t3", accuracy=0.8),
            _sample_trial_result("t4", accuracy=0.9),
        ]
        runner.run_trial.side_effect = results

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            max_trials=5,
            early_stop_patience=3,
        )
        run = engine.run()

        assert len(run.trials) == 5
        assert run.best_trial.accuracy == 0.9


# ---------------------------------------------------------------------------
# Progress callback
# ---------------------------------------------------------------------------


class TestProgressCallback:
    """Tests for progress_callback."""

    def test_callback_called(self) -> None:
        optimizer = MagicMock()
        runner = MagicMock()

        optimizer.propose_initial.return_value = TrialConfig(
            trial_id="t0", params={},
        )
        optimizer.propose_next.side_effect = [
            TrialConfig(trial_id=f"t{i}", params={})
            for i in range(1, 3)
        ]
        optimizer.analyze_trial.return_value = "ok"
        optimizer.optimizer_model = "m"
        runner.benchmark = "b"

        results = [
            _sample_trial_result(f"t{i}", accuracy=0.5 + i * 0.1)
            for i in range(3)
        ]
        runner.run_trial.side_effect = results

        callback = MagicMock()

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            max_trials=3,
        )
        engine.run(progress_callback=callback)

        assert callback.call_count == 3
        callback.assert_any_call(1, 3)
        callback.assert_any_call(2, 3)
        callback.assert_any_call(3, 3)

    def test_no_callback(self) -> None:
        """run() should work fine without a callback."""
        optimizer = MagicMock()
        runner = MagicMock()

        optimizer.propose_initial.return_value = TrialConfig(
            trial_id="t0", params={},
        )
        optimizer.analyze_trial.return_value = "ok"
        optimizer.optimizer_model = "m"
        runner.run_trial.return_value = _sample_trial_result("t0", 0.8)
        runner.benchmark = "b"

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            max_trials=1,
        )
        run = engine.run()
        assert run.status == "completed"


# ---------------------------------------------------------------------------
# export_best_recipe
# ---------------------------------------------------------------------------


class TestExportBestRecipe:
    """Tests for export_best_recipe."""

    def test_exports_valid_toml(self, tmp_path) -> None:
        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=MagicMock(),
            trial_runner=MagicMock(),
        )

        best = _sample_trial_result("best", accuracy=0.95)
        best.config.params = {
            "intelligence.model": "qwen3:8b",
            "intelligence.temperature": 0.3,
            "engine.backend": "ollama",
            "agent.type": "native_react",
            "agent.max_turns": 10,
            "tools.tool_set": ["calculator", "think"],
            "learning.routing_policy": "grpo",
        }

        run = OptimizationRun(
            run_id="run-export",
            search_space=_sample_search_space(),
            best_trial=best,
            status="completed",
        )

        path = tmp_path / "best_recipe.toml"
        result_path = engine.export_best_recipe(run, path)

        assert result_path == path
        assert path.exists()
        assert run.best_recipe_path == str(path)

        # Verify it's valid TOML
        with open(path, "rb") as fh:
            data = tomllib.load(fh)

        assert data["recipe"]["name"] == "optimized-best"
        assert "0.9500" in data["recipe"]["description"]
        assert data["intelligence"]["model"] == "qwen3:8b"
        assert data["intelligence"]["temperature"] == 0.3
        assert data["engine"]["key"] == "ollama"
        assert data["agent"]["type"] == "native_react"
        assert data["agent"]["max_turns"] == 10
        assert data["agent"]["tools"] == ["calculator", "think"]
        assert data["learning"]["routing"] == "grpo"

    def test_export_creates_parent_dirs(self, tmp_path) -> None:
        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=MagicMock(),
            trial_runner=MagicMock(),
        )

        best = _sample_trial_result("best", accuracy=0.9)
        run = OptimizationRun(
            run_id="run-dirs",
            search_space=_sample_search_space(),
            best_trial=best,
            status="completed",
        )

        path = tmp_path / "nested" / "deep" / "recipe.toml"
        result_path = engine.export_best_recipe(run, path)
        assert result_path.exists()

    def test_export_no_best_trial_raises(self, tmp_path) -> None:
        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=MagicMock(),
            trial_runner=MagicMock(),
        )

        run = OptimizationRun(
            run_id="run-no-best",
            search_space=_sample_search_space(),
            best_trial=None,
        )

        try:
            engine.export_best_recipe(run, tmp_path / "out.toml")
            assert False, "Expected ValueError"
        except ValueError as e:
            assert "No best trial" in str(e)

    def test_export_minimal_params(self, tmp_path) -> None:
        """Export with minimal params should still produce valid TOML."""
        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=MagicMock(),
            trial_runner=MagicMock(),
        )

        config = TrialConfig(trial_id="min", params={})
        best = TrialResult(
            trial_id="min", config=config, accuracy=0.5,
        )
        run = OptimizationRun(
            run_id="run-min",
            search_space=_sample_search_space(),
            best_trial=best,
        )

        path = tmp_path / "minimal.toml"
        engine.export_best_recipe(run, path)

        with open(path, "rb") as fh:
            data = tomllib.load(fh)

        assert data["recipe"]["name"] == "optimized-min"


# ---------------------------------------------------------------------------
# run() with store
# ---------------------------------------------------------------------------


class TestRunWithStore:
    """Tests for run() with a real OptimizationStore."""

    def test_saves_trials_and_run(self, tmp_path) -> None:
        store = OptimizationStore(tmp_path / "opt.db")
        optimizer = MagicMock()
        runner = MagicMock()

        optimizer.propose_initial.return_value = TrialConfig(
            trial_id="t0", params={},
        )
        optimizer.propose_next.return_value = TrialConfig(
            trial_id="t1", params={},
        )
        optimizer.analyze_trial.return_value = "analysis"
        optimizer.optimizer_model = "m"
        runner.benchmark = "b"

        runner.run_trial.side_effect = [
            _sample_trial_result("t0", accuracy=0.7),
            _sample_trial_result("t1", accuracy=0.8),
        ]

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            store=store,
            max_trials=2,
        )
        run = engine.run()

        # Verify trials were saved
        trials = store.get_trials(run.run_id)
        assert len(trials) == 2

        # Verify run was saved
        loaded_run = store.get_run(run.run_id)
        assert loaded_run is not None
        assert loaded_run.status == "completed"
        assert len(loaded_run.trials) == 2

        store.close()

    def test_no_store_does_not_error(self) -> None:
        optimizer = MagicMock()
        runner = MagicMock()

        optimizer.propose_initial.return_value = TrialConfig(
            trial_id="t0", params={},
        )
        optimizer.analyze_trial.return_value = "ok"
        optimizer.optimizer_model = "m"
        runner.run_trial.return_value = _sample_trial_result("t0", 0.8)
        runner.benchmark = "b"

        engine = OptimizationEngine(
            search_space=_sample_search_space(),
            llm_optimizer=optimizer,
            trial_runner=runner,
            store=None,
            max_trials=1,
        )
        run = engine.run()
        assert run.status == "completed"


# ---------------------------------------------------------------------------
# config.py
# ---------------------------------------------------------------------------


class TestLoadOptimizeConfig:
    """Tests for load_optimize_config."""

    def test_loads_toml_file(self, tmp_path) -> None:
        from openjarvis.optimize.config import load_optimize_config

        toml_content = b"""
[optimize]
max_trials = 15
benchmark = "supergpqa"

[[optimize.search]]
name = "agent.type"
type = "categorical"
values = ["simple", "orchestrator"]

[optimize.fixed]
engine = "ollama"
"""
        path = tmp_path / "optimize.toml"
        path.write_bytes(toml_content)

        config = load_optimize_config(path)
        assert config["optimize"]["max_trials"] == 15
        assert config["optimize"]["benchmark"] == "supergpqa"
        assert len(config["optimize"]["search"]) == 1
        assert config["optimize"]["fixed"]["engine"] == "ollama"

    def test_file_not_found(self, tmp_path) -> None:
        from openjarvis.optimize.config import load_optimize_config

        try:
            load_optimize_config(tmp_path / "nonexistent.toml")
            assert False, "Expected FileNotFoundError"
        except FileNotFoundError:
            pass

    def test_loads_string_path(self, tmp_path) -> None:
        from openjarvis.optimize.config import load_optimize_config

        path = tmp_path / "test.toml"
        path.write_bytes(b'[optimize]\nmax_trials = 5\n')

        config = load_optimize_config(str(path))
        assert config["optimize"]["max_trials"] == 5
