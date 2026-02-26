"""Apple Silicon energy monitor — via zeus-ml[apple]."""

from __future__ import annotations

import platform
import time
from contextlib import contextmanager
from typing import Generator

from openjarvis.telemetry.energy_monitor import (
    EnergyMonitor,
    EnergySample,
    EnergyVendor,
)

try:
    from zeus.device.soc.apple import AppleSiliconMonitor

    _ZEUS_APPLE_AVAILABLE = True
except ImportError:
    _ZEUS_APPLE_AVAILABLE = False


class AppleEnergyMonitor(EnergyMonitor):
    """Apple Silicon energy monitor wrapping zeus-ml[apple].

    Uses ``AppleSiliconMonitor.begin_window()`` / ``end_window()`` for
    per-component energy breakdown: CPU, GPU, DRAM, ANE (Neural Engine).
    """

    def __init__(self, poll_interval_ms: int = 50) -> None:
        self._poll_interval_ms = poll_interval_ms
        self._monitor = None
        self._initialized = False

        if _ZEUS_APPLE_AVAILABLE and platform.system() == "Darwin":
            try:
                self._monitor = AppleSiliconMonitor()
                self._initialized = True
            except Exception:
                self._initialized = False

    @staticmethod
    def available() -> bool:
        if platform.system() != "Darwin":
            return False
        if not _ZEUS_APPLE_AVAILABLE:
            return False
        try:
            AppleSiliconMonitor()
            return True
        except Exception:
            return False

    def vendor(self) -> EnergyVendor:
        return EnergyVendor.APPLE

    def energy_method(self) -> str:
        return "zeus"

    @contextmanager
    def sample(self) -> Generator[EnergySample, None, None]:
        result = EnergySample(
            vendor=EnergyVendor.APPLE.value,
            device_name=platform.processor() or "Apple Silicon",
            device_count=1,
            energy_method=self.energy_method(),
        )

        if not self._initialized or self._monitor is None:
            t_start = time.monotonic()
            yield result
            result.duration_seconds = time.monotonic() - t_start
            return

        window_name = f"openjarvis_{time.monotonic_ns()}"
        t_start = time.monotonic()
        self._monitor.begin_window(window_name)

        yield result

        measurement = self._monitor.end_window(window_name)
        wall = time.monotonic() - t_start

        # Extract per-component energy (joules)
        cpu_j = getattr(measurement, "cpu_energy", 0.0)
        gpu_j = getattr(measurement, "gpu_energy", 0.0)
        dram_j = getattr(measurement, "dram_energy", 0.0)
        ane_j = getattr(measurement, "ane_energy", 0.0)

        result.cpu_energy_joules = float(cpu_j)
        result.gpu_energy_joules = float(gpu_j)
        result.dram_energy_joules = float(dram_j)
        result.ane_energy_joules = float(ane_j)
        result.energy_joules = (
            result.cpu_energy_joules
            + result.gpu_energy_joules
            + result.dram_energy_joules
            + result.ane_energy_joules
        )
        result.duration_seconds = wall
        if wall > 0:
            result.mean_power_watts = result.energy_joules / wall

    def close(self) -> None:
        self._monitor = None
        self._initialized = False


__all__ = ["AppleEnergyMonitor"]
