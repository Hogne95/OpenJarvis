"""``jarvis bench`` — run inference benchmarks."""

from __future__ import annotations

import json as json_mod
import sys

import click
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table

from openjarvis.core.config import load_config
from openjarvis.engine import get_engine

_BANNER = r"""
  ___                       _                  _
 / _ \ _ __   ___ _ __     | | __ _ _ ____   _(_)___
| | | | '_ \ / _ \ '_ \ _  | |/ _` | '__\ \ / / / __|
| |_| | |_) |  __/ | | | |_| | (_| | |   \ V /| \__ \
 \___/| .__/ \___|_| |_|\___/ \__,_|_|    \_/ |_|___/
      |_|
"""


def _print_banner(console: Console) -> None:
    panel = Panel(
        _BANNER.rstrip(),
        border_style="cyan",
        title="[bold white]v1.8[/bold white]",
        expand=False,
    )
    console.print(panel)


def _section(console: Console, title: str) -> None:
    console.print(Rule(title, style="bright_blue"))


@click.group()
def bench() -> None:
    """Run inference benchmarks."""


@bench.command()
@click.option("-m", "--model", "model_name", default=None, help="Model to benchmark.")
@click.option("-e", "--engine", "engine_key", default=None, help="Engine backend.")
@click.option(
    "-n", "--samples", "num_samples", default=10, type=int,
    help="Number of samples per benchmark.",
)
@click.option(
    "-b", "--benchmark", "benchmark_name", default=None,
    help="Specific benchmark to run (default: all).",
)
@click.option(
    "-o", "--output", "output_path", default=None, type=click.Path(),
    help="Write JSONL results to file.",
)
@click.option(
    "--json", "output_json", is_flag=True,
    help="Output JSON summary to stdout.",
)
@click.option(
    "-w", "--warmup", "warmup", default=0, type=int,
    help="Number of warmup iterations before measurement.",
)
def run(
    model_name: str | None,
    engine_key: str | None,
    num_samples: int,
    benchmark_name: str | None,
    output_path: str | None,
    output_json: bool,
    warmup: int,
) -> None:
    """Run benchmarks against an inference engine."""
    console = Console(stderr=True)
    config = load_config()

    # Import and register benchmarks
    from openjarvis.bench import ensure_registered
    from openjarvis.bench._stubs import BenchmarkSuite
    from openjarvis.core.registry import BenchmarkRegistry

    ensure_registered()

    # Get engine
    resolved = get_engine(config, engine_key)
    if resolved is None:
        console.print("[red bold]No inference engine available.[/red bold]")
        sys.exit(1)

    engine_name, engine = resolved

    # Resolve model
    if model_name is None:
        models = engine.list_models()
        if models:
            model_name = models[0]
        else:
            console.print("[red]No model available on engine.[/red]")
            sys.exit(1)

    # Select benchmarks
    if benchmark_name:
        if not BenchmarkRegistry.contains(benchmark_name):
            console.print(
                f"[red]Unknown benchmark: {benchmark_name}. "
                f"Available: {', '.join(BenchmarkRegistry.keys())}[/red]"
            )
            sys.exit(1)
        bench_cls = BenchmarkRegistry.get(benchmark_name)
        benchmarks = [bench_cls()]
    else:
        benchmarks = [cls() for _, cls in BenchmarkRegistry.items()]

    if not benchmarks:
        console.print("[yellow]No benchmarks registered.[/yellow]")
        return

    suite = BenchmarkSuite(benchmarks)

    # Create energy monitor for energy benchmarks
    energy_monitor = None
    if config.telemetry.gpu_metrics:
        try:
            from openjarvis.telemetry.energy_monitor import create_energy_monitor

            energy_monitor = create_energy_monitor(
                prefer_vendor=config.telemetry.energy_vendor or None,
            )
        except Exception:
            pass

    # Banner + configuration
    _print_banner(console)
    _section(console, "Configuration")
    bench_names = [b.name for b in benchmarks]
    config_panel = Panel(
        f"[cyan]Engine:[/cyan]     {engine_name}\n"
        f"[cyan]Model:[/cyan]      {model_name}\n"
        f"[cyan]Benchmarks:[/cyan] {', '.join(bench_names)}\n"
        f"[cyan]Samples:[/cyan]    {num_samples}\n"
        f"[cyan]Warmup:[/cyan]     {warmup}",
        title="[bold]Run Configuration[/bold]",
        border_style="blue",
        expand=False,
    )
    console.print(config_panel)

    # Run benchmarks
    _section(console, "Execution")
    with console.status(
        f"[bold cyan]Running {len(benchmarks)} benchmark(s)...[/bold cyan]",
    ):
        results = suite.run_all(
            engine, model_name,
            num_samples=num_samples, warmup_samples=warmup,
            energy_monitor=energy_monitor,
        )

    # Output results
    if output_path:
        jsonl = suite.to_jsonl(results)
        with open(output_path, "w") as fh:
            fh.write(jsonl + "\n")
        console.print(f"[green]Results written to {output_path}[/green]")

    if output_json:
        summary = suite.summary(results)
        click.echo(json_mod.dumps(summary, indent=2))
    elif not output_path:
        # Pretty-print results as Rich tables
        _section(console, "Results")
        for r in results:
            table = Table(
                title=(
                    f"[bold]{r.benchmark_name}[/bold]"
                    f"  ({r.samples} samples, {r.errors} errors)"
                ),
                show_header=True,
                header_style="bold bright_white",
                border_style="bright_blue",
                title_style="bold cyan",
            )
            table.add_column("Metric", style="cyan", no_wrap=True)
            table.add_column("Value", justify="right", style="green")

            for k, v in r.metrics.items():
                table.add_row(k, f"{v:.4f}")
            if r.total_energy_joules > 0:
                table.add_row("Total Energy (J)", f"{r.total_energy_joules:.4f}")
                table.add_row("Energy Method", str(r.energy_method))
            if r.energy_per_token_joules > 0:
                table.add_row(
                    "Energy/Token (J)", f"{r.energy_per_token_joules:.6f}",
                )

            console.print(table)

    # Cleanup energy monitor
    if energy_monitor is not None:
        try:
            energy_monitor.close()
        except Exception:
            pass
