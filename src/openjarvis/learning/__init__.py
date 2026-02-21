"""Learning pillar — router policy and reward functions."""

from __future__ import annotations

from openjarvis.learning._stubs import RewardFunction, RouterPolicy, RoutingContext
from openjarvis.learning.heuristic_reward import HeuristicRewardFunction


def ensure_registered() -> None:
    """Ensure all learning policies are registered in RouterPolicyRegistry.

    Imported lazily to avoid circular imports with the intelligence pillar.
    """
    from openjarvis.learning.heuristic_policy import (
        ensure_registered as _reg_heuristic,
    )

    _reg_heuristic()

    try:
        from openjarvis.learning.grpo_policy import (
            ensure_registered as _reg_grpo,
        )

        _reg_grpo()
    except ImportError:
        pass

    from openjarvis.learning.trace_policy import (
        ensure_registered as _reg_trace,
    )

    _reg_trace()


__all__ = [
    "HeuristicRewardFunction",
    "RewardFunction",
    "RouterPolicy",
    "RoutingContext",
    "ensure_registered",
]
