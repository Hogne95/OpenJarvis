"""Rich display helpers for the evaluation framework and bench CLI."""

from __future__ import annotations

from typing import TYPE_CHECKING, Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table

if TYPE_CHECKING:
    from pathlib import Path

    from evals.core.types import MetricStats, RunSummary

OPENJARVIS_BANNER = r"""
  ___                       _                  _
 / _ \ _ __   ___ _ __     | | __ _ _ ____   _(_)___
| | | | '_ \ / _ \ '_ \ _  | |/ _` | '__\ \ / / / __|
| |_| | |_) |  __/ | | | |_| | (_| | |   \ V /| \__ \
 \___/| .__/ \___|_| |_|\___/ \__,_|_|    \_/ |_|___/
      |_|
"""

VERSION = "v1.8"


def print_banner(console: Console) -> None:
    """Print the OpenJarvis ASCII banner inside a styled panel."""
    panel = Panel(
        OPENJARVIS_BANNER.rstrip(),
        border_style="cyan",
        title=f"[bold white]{VERSION}[/bold white]",
        expand=False,
    )
    console.print(panel)


def print_section(console: Console, title: str) -> None:
    """Print a horizontal rule section separator."""
    console.print(Rule(title, style="bright_blue"))


def print_run_header(
    console: Console,
    benchmark: str,
    model: str,
    backend: str,
    samples: Optional[int],
    workers: int,
    warmup: int = 0,
) -> None:
    """Print a compact run configuration panel."""
    lines = [
        f"[cyan]Benchmark:[/cyan]  {benchmark}",
        f"[cyan]Model:[/cyan]      {model}",
        f"[cyan]Backend:[/cyan]    {backend}",
        f"[cyan]Samples:[/cyan]    {samples if samples is not None else 'all'}",
        f"[cyan]Workers:[/cyan]    {workers}",
    ]
    if warmup > 0:
        lines.append(f"[cyan]Warmup:[/cyan]     {warmup}")
    body = "\n".join(lines)
    panel = Panel(
        body,
        title="[bold]Run Configuration[/bold]",
        border_style="blue",
        expand=False,
    )
    console.print(panel)


def _fmt(val: float, decimals: int = 4) -> str:
    """Format a float to a fixed number of decimal places."""
    return f"{val:.{decimals}f}"


def _add_metric_row(
    table: Table,
    label: str,
    stats: Optional[MetricStats],
    decimals: int = 4,
) -> None:
    """Add a row for a metric if stats exist."""
    if stats is None:
        return
    table.add_row(
        label,
        _fmt(stats.mean, decimals),
        _fmt(stats.median, decimals),
        _fmt(stats.min, decimals),
        _fmt(stats.max, decimals),
        _fmt(stats.std, decimals),
        _fmt(stats.p95, decimals),
        _fmt(stats.p99, decimals),
    )


def print_metrics_table(console: Console, summary: RunSummary) -> None:
    """Print the unified metrics table with all available stats."""
    table = Table(
        title="[bold]Task-Level Metrics[/bold]",
        show_header=True,
        header_style="bold bright_white",
        border_style="bright_blue",
        title_style="bold cyan",
    )
    table.add_column("Metric", style="cyan", no_wrap=True)
    table.add_column("Avg", justify="right")
    table.add_column("Median", justify="right")
    table.add_column("Min", justify="right")
    table.add_column("Max", justify="right")
    table.add_column("Std", justify="right")
    table.add_column("P95", justify="right")
    table.add_column("P99", justify="right")

    _add_metric_row(table, "Accuracy", summary.accuracy_stats)
    _add_metric_row(table, "Latency (s)", summary.latency_stats)
    _add_metric_row(table, "TTFT (s)", summary.ttft_stats)
    _add_metric_row(table, "Input Tokens", summary.input_token_stats, decimals=1)
    _add_metric_row(table, "Output Tokens", summary.output_token_stats, decimals=1)
    _add_metric_row(table, "Throughput (tok/s)", summary.throughput_stats)
    _add_metric_row(table, "Energy (J)", summary.energy_stats)
    _add_metric_row(table, "Power (W)", summary.power_stats)
    _add_metric_row(table, "GPU Util (%)", summary.gpu_utilization_stats, decimals=1)
    _add_metric_row(
        table, "Energy/OutTok (J)",
        summary.energy_per_output_token_stats, decimals=6,
    )
    _add_metric_row(table, "Throughput/Watt", summary.throughput_per_watt_stats)
    _add_metric_row(table, "MFU (%)", summary.mfu_stats, decimals=2)
    _add_metric_row(table, "MBU (%)", summary.mbu_stats, decimals=2)
    _add_metric_row(table, "IPW", summary.ipw_stats)
    _add_metric_row(table, "IPJ", summary.ipj_stats)
    _add_metric_row(table, "Mean ITL (ms)", summary.itl_stats, decimals=2)

    if table.row_count > 0:
        console.print(table)

    # Headline stats below the table
    headline = (
        f"[bold]Accuracy:[/bold] {summary.accuracy:.4f}  "
        f"({summary.correct}/{summary.scored_samples} scored)  "
        f"[bold]Mean Latency:[/bold] {summary.mean_latency_seconds:.2f}s  "
        f"[bold]Cost:[/bold] ${summary.total_cost_usd:.4f}"
    )
    if summary.total_energy_joules > 0:
        headline += f"  [bold]Total Energy:[/bold] {summary.total_energy_joules:.4f}J"
    if summary.warmup_samples_excluded > 0:
        headline += f"  [dim](warmup: {summary.warmup_samples_excluded} excluded)[/dim]"
    console.print(headline)


def print_subject_table(
    console: Console,
    per_subject: Dict[str, Dict[str, float]],
) -> None:
    """Print per-subject accuracy breakdown."""
    table = Table(
        title="[bold]Per-Subject Breakdown[/bold]",
        show_header=True,
        header_style="bold bright_white",
        border_style="bright_blue",
        title_style="bold cyan",
    )
    table.add_column("Subject", style="cyan", no_wrap=True)
    table.add_column("Accuracy", justify="right")
    table.add_column("Correct", justify="right")
    table.add_column("Scored", justify="right")

    for subj, stats in sorted(per_subject.items()):
        table.add_row(
            subj,
            f"{stats['accuracy']:.4f}",
            str(int(stats.get("correct", 0))),
            str(int(stats.get("scored", 0))),
        )

    console.print(table)


def print_suite_summary(
    console: Console,
    summaries: List[RunSummary],
    suite_name: str = "",
) -> None:
    """Print a multi-run suite summary table."""
    title = f"Suite Results: {suite_name}" if suite_name else "Suite Results"
    table = Table(
        title=f"[bold]{title}[/bold]",
        show_header=True,
        header_style="bold bright_white",
        border_style="green",
        title_style="bold green",
    )
    table.add_column("Benchmark", style="cyan", no_wrap=True)
    table.add_column("Model", style="white")
    table.add_column("Accuracy", justify="right", style="bold")
    table.add_column("Scored", justify="right")
    table.add_column("Latency (s)", justify="right")
    table.add_column("Cost ($)", justify="right")

    for s in summaries:
        model_display = s.model if len(s.model) <= 24 else s.model[:21] + "..."
        table.add_row(
            s.benchmark,
            model_display,
            f"{s.accuracy:.4f}",
            f"{s.correct}/{s.scored_samples}",
            f"{s.mean_latency_seconds:.2f}",
            f"{s.total_cost_usd:.4f}",
        )

    console.print(table)


def print_completion(
    console: Console,
    summary: RunSummary,
    output_path: Optional[Path] = None,
    traces_dir: Optional[Path] = None,
) -> None:
    """Print a completion panel showing where data was saved."""
    lines = [
        "[bold green]Evaluation complete[/bold green]",
        (
            f"  Samples: {summary.total_samples}"
            f"  Scored: {summary.scored_samples}"
            f"  Errors: {summary.errors}"
        ),
    ]
    if output_path:
        lines.append(f"  [cyan]JSONL:[/cyan]   {output_path}")
        summary_path = (
            output_path.with_suffix(".summary.json")
            if hasattr(output_path, "with_suffix")
            else None
        )
        if summary_path:
            lines.append(f"  [cyan]Summary:[/cyan] {summary_path}")
    if traces_dir:
        lines.append(f"  [cyan]Traces:[/cyan]  {traces_dir}")
    body = "\n".join(lines)
    panel = Panel(body, border_style="green", expand=False)
    console.print(panel)


__all__ = [
    "OPENJARVIS_BANNER",
    "print_banner",
    "print_section",
    "print_run_header",
    "print_metrics_table",
    "print_subject_table",
    "print_suite_summary",
    "print_completion",
]
