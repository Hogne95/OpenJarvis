"""SQLite-backed storage for optimization runs and trials."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from openjarvis.optimize.types import (
    OptimizationRun,
    SearchSpace,
    TrialConfig,
    TrialResult,
)

_CREATE_RUNS = """\
CREATE TABLE IF NOT EXISTS optimization_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    search_space TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'running',
    optimizer_model TEXT NOT NULL DEFAULT '',
    benchmark TEXT NOT NULL DEFAULT '',
    best_trial_id TEXT,
    best_recipe_path TEXT,
    created_at REAL NOT NULL DEFAULT 0.0,
    updated_at REAL NOT NULL DEFAULT 0.0
);
"""

_CREATE_TRIALS = """\
CREATE TABLE IF NOT EXISTS trial_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trial_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    reasoning TEXT NOT NULL DEFAULT '',
    accuracy REAL NOT NULL DEFAULT 0.0,
    mean_latency_seconds REAL NOT NULL DEFAULT 0.0,
    total_cost_usd REAL NOT NULL DEFAULT 0.0,
    total_energy_joules REAL NOT NULL DEFAULT 0.0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    samples_evaluated INTEGER NOT NULL DEFAULT 0,
    analysis TEXT NOT NULL DEFAULT '',
    failure_modes TEXT NOT NULL DEFAULT '[]',
    created_at REAL NOT NULL DEFAULT 0.0,
    FOREIGN KEY (run_id) REFERENCES optimization_runs(run_id)
);
"""

_INSERT_RUN = """\
INSERT OR REPLACE INTO optimization_runs (
    run_id, search_space, status, optimizer_model, benchmark,
    best_trial_id, best_recipe_path, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_INSERT_TRIAL = """\
INSERT OR REPLACE INTO trial_results (
    trial_id, run_id, config, reasoning, accuracy,
    mean_latency_seconds, total_cost_usd, total_energy_joules,
    total_tokens, samples_evaluated, analysis, failure_modes,
    created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


class OptimizationStore:
    """SQLite-backed storage for optimization runs and trials."""

    def __init__(self, db_path: Union[str, Path]) -> None:
        self._db_path = str(db_path)
        self._conn = sqlite3.connect(self._db_path)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(_CREATE_RUNS)
        self._conn.execute(_CREATE_TRIALS)
        self._conn.commit()

    # ------------------------------------------------------------------
    # Runs
    # ------------------------------------------------------------------

    def save_run(self, run: OptimizationRun) -> None:
        """Persist an optimization run (insert or update)."""
        now = time.time()
        search_space_json = self._search_space_to_json(run.search_space)
        best_trial_id = run.best_trial.trial_id if run.best_trial else None
        self._conn.execute(
            _INSERT_RUN,
            (
                run.run_id,
                search_space_json,
                run.status,
                run.optimizer_model,
                run.benchmark,
                best_trial_id,
                run.best_recipe_path,
                now,
                now,
            ),
        )
        self._conn.commit()

    def get_run(self, run_id: str) -> Optional[OptimizationRun]:
        """Retrieve an optimization run by id, or ``None``."""
        row = self._conn.execute(
            "SELECT * FROM optimization_runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_run(row)

    def list_runs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return summary dicts of recent optimization runs."""
        rows = self._conn.execute(
            "SELECT * FROM optimization_runs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        result: List[Dict[str, Any]] = []
        for row in rows:
            result.append(
                {
                    "run_id": row[1],
                    "status": row[3],
                    "optimizer_model": row[4],
                    "benchmark": row[5],
                    "best_trial_id": row[6],
                    "best_recipe_path": row[7],
                    "created_at": row[8],
                    "updated_at": row[9],
                }
            )
        return result

    # ------------------------------------------------------------------
    # Trials
    # ------------------------------------------------------------------

    def save_trial(self, run_id: str, trial: TrialResult) -> None:
        """Persist a single trial result."""
        now = time.time()
        self._conn.execute(
            _INSERT_TRIAL,
            (
                trial.trial_id,
                run_id,
                json.dumps(trial.config.params),
                trial.config.reasoning,
                trial.accuracy,
                trial.mean_latency_seconds,
                trial.total_cost_usd,
                trial.total_energy_joules,
                trial.total_tokens,
                trial.samples_evaluated,
                trial.analysis,
                json.dumps(trial.failure_modes),
                now,
            ),
        )
        self._conn.commit()

    def get_trials(self, run_id: str) -> List[TrialResult]:
        """Retrieve all trial results for a given run."""
        rows = self._conn.execute(
            "SELECT * FROM trial_results WHERE run_id = ? ORDER BY id",
            (run_id,),
        ).fetchall()
        return [self._row_to_trial(r) for r in rows]

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        """Close the underlying SQLite connection."""
        self._conn.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _search_space_to_json(space: SearchSpace) -> str:
        """Serialize a SearchSpace to JSON."""
        dims = []
        for d in space.dimensions:
            dims.append(
                {
                    "name": d.name,
                    "dim_type": d.dim_type,
                    "values": d.values,
                    "low": d.low,
                    "high": d.high,
                    "description": d.description,
                    "pillar": d.pillar,
                }
            )
        return json.dumps(
            {
                "dimensions": dims,
                "fixed": space.fixed,
                "constraints": space.constraints,
            }
        )

    @staticmethod
    def _json_to_search_space(raw: str) -> SearchSpace:
        """Deserialize a SearchSpace from JSON."""
        from openjarvis.optimize.types import SearchDimension

        data = json.loads(raw)
        dims = []
        for d in data.get("dimensions", []):
            dims.append(
                SearchDimension(
                    name=d.get("name", ""),
                    dim_type=d.get("dim_type", "categorical"),
                    values=d.get("values", []),
                    low=d.get("low"),
                    high=d.get("high"),
                    description=d.get("description", ""),
                    pillar=d.get("pillar", ""),
                )
            )
        return SearchSpace(
            dimensions=dims,
            fixed=data.get("fixed", {}),
            constraints=data.get("constraints", []),
        )

    def _row_to_run(self, row: tuple) -> OptimizationRun:
        """Convert a database row to an OptimizationRun."""
        run_id = row[1]
        search_space = self._json_to_search_space(row[2])
        status = row[3]
        optimizer_model = row[4]
        benchmark = row[5]
        best_trial_id = row[6]
        best_recipe_path = row[7]

        # Load trials for this run
        trials = self.get_trials(run_id)

        # Find the best trial
        best_trial: Optional[TrialResult] = None
        if best_trial_id:
            for t in trials:
                if t.trial_id == best_trial_id:
                    best_trial = t
                    break

        return OptimizationRun(
            run_id=run_id,
            search_space=search_space,
            trials=trials,
            best_trial=best_trial,
            best_recipe_path=best_recipe_path,
            status=status,
            optimizer_model=optimizer_model,
            benchmark=benchmark,
        )

    @staticmethod
    def _row_to_trial(row: tuple) -> TrialResult:
        """Convert a database row to a TrialResult."""
        trial_id = row[1]
        # row[2] = run_id (not stored on TrialResult)
        params = json.loads(row[3])
        reasoning = row[4]
        accuracy = row[5]
        mean_latency = row[6]
        cost = row[7]
        energy = row[8]
        tokens = row[9]
        samples = row[10]
        analysis = row[11]
        failure_modes = json.loads(row[12])

        config = TrialConfig(
            trial_id=trial_id,
            params=params,
            reasoning=reasoning,
        )
        return TrialResult(
            trial_id=trial_id,
            config=config,
            accuracy=accuracy,
            mean_latency_seconds=mean_latency,
            total_cost_usd=cost,
            total_energy_joules=energy,
            total_tokens=tokens,
            samples_evaluated=samples,
            analysis=analysis,
            failure_modes=failure_modes,
        )


__all__ = ["OptimizationStore"]
