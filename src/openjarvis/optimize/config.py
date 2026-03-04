"""TOML config loader for optimization runs."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Union

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib  # type: ignore[no-redef]


def load_optimize_config(path: Union[str, Path]) -> Dict[str, Any]:
    """Load an optimization config TOML file.

    Returns the raw dict with keys such as ``optimize.max_trials``,
    ``optimize.benchmark``, ``optimize.search``, ``optimize.fixed``,
    ``optimize.constraints``, etc.

    Raises:
        FileNotFoundError: If *path* does not exist.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Optimization config not found: {path}")

    with open(path, "rb") as fh:
        data: Dict[str, Any] = tomllib.load(fh)

    return data


__all__ = ["load_optimize_config"]
