"""AMD-specific hardware tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from openjarvis.core.config import (
    GpuInfo,
    HardwareInfo,
    _detect_amd_gpu,
    recommend_engine,
)

pytestmark = pytest.mark.amd


# ---------------------------------------------------------------------------
# Detection / rocm-smi parsing
# ---------------------------------------------------------------------------


class TestAMDDetection:
    """Tests for _detect_amd_gpu() against various rocm-smi outputs."""

    @patch("openjarvis.core.config.shutil.which", return_value="/usr/bin/rocm-smi")
    @patch(
        "openjarvis.core.config._run_cmd",
        return_value="AMD Instinct MI300X",
    )
    def test_rocm_smi_parsing(self, mock_run, mock_which):
        gpu = _detect_amd_gpu()
        assert gpu is not None
        assert gpu.vendor == "amd"
        assert "MI300X" in gpu.name

    @patch("openjarvis.core.config.shutil.which", return_value=None)
    def test_rocm_smi_not_found(self, mock_which):
        assert _detect_amd_gpu() is None

    @patch("openjarvis.core.config.shutil.which", return_value="/usr/bin/rocm-smi")
    @patch(
        "openjarvis.core.config._run_cmd",
        return_value="AMD Instinct MI250X\nAMD Instinct MI250X",
    )
    def test_amd_gpu_model(self, mock_run, mock_which):
        """First line of rocm-smi output is used as the GPU name."""
        gpu = _detect_amd_gpu()
        assert gpu is not None
        assert "MI250X" in gpu.name

    @patch("openjarvis.core.config.shutil.which", return_value="/usr/bin/rocm-smi")
    @patch("openjarvis.core.config._run_cmd", return_value="")
    def test_rocm_smi_empty_output(self, mock_run, mock_which):
        """Empty output from rocm-smi returns None."""
        assert _detect_amd_gpu() is None

    @patch("openjarvis.core.config.shutil.which", return_value="/usr/bin/rocm-smi")
    @patch(
        "openjarvis.core.config._run_cmd",
        return_value="AMD Instinct MI300X",
    )
    def test_amd_vram(self, mock_run, mock_which):
        """AMD detection does not parse VRAM; defaults to 0.0."""
        gpu = _detect_amd_gpu()
        assert gpu is not None
        assert gpu.vram_gb == 0.0


# ---------------------------------------------------------------------------
# Engine recommendation
# ---------------------------------------------------------------------------


class TestAMDEngineRecommendation:
    """Tests that AMD cards map to vllm."""

    def test_mi300x_recommends_vllm(self):
        hw = HardwareInfo(
            platform="linux",
            cpu_brand="AMD EPYC 9654",
            cpu_count=96,
            ram_gb=768.0,
            gpu=GpuInfo(
                vendor="amd", name="AMD Instinct MI300X",
                vram_gb=192.0, count=1,
            ),
        )
        assert recommend_engine(hw) == "vllm"

    def test_amd_generic_recommends_vllm(self):
        hw = HardwareInfo(
            platform="linux",
            cpu_brand="AMD EPYC",
            cpu_count=64,
            ram_gb=256.0,
            gpu=GpuInfo(vendor="amd", name="AMD GPU", vram_gb=0.0, count=1),
        )
        assert recommend_engine(hw) == "vllm"

    def test_amd_multi_gpu_recommends_vllm(self):
        hw = HardwareInfo(
            platform="linux",
            cpu_brand="AMD EPYC 9654",
            cpu_count=128,
            ram_gb=1024.0,
            gpu=GpuInfo(
                vendor="amd", name="AMD Instinct MI300X",
                vram_gb=192.0, count=4,
            ),
        )
        assert recommend_engine(hw) == "vllm"
