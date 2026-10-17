#!/usr/bin/env python3
"""Run the project's tests and print only the failures, in compact Markdown.

Exit codes: 0 all passed, 1 test failures, 2 usage, detection, or runner error.
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from detect import (
    GODOT_KINDS,
    GODOT_TIMEOUT,
    DetectError,
    parse_target,
    rel,
    select_project,
)
from parse import CRASH_LINES, Failure, Report, RunOutput, parse
from plan import Plan, build_plan, changed_files, git

MESSAGE_LINES = 8
LINE_WIDTH = 200
REPORT_SUFFIX = {"pytest": ".xml", "jest": ".json", "vitest": ".json", "gut": ".xml"}
ENV = {
    "NO_COLOR": "1",
    "FORCE_COLOR": "0",
    "MSBUILDTERMINALLOGGER": "off",
    "DOTNET_CLI_UI_LANGUAGE": "en",
    "DOTNET_NOLOGO": "1",
}


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Detect the test runner, run the affected tests (or the given targets), "
            "and print compact failures. Each failure id is a valid target for a rerun."
        )
    )
    parser.add_argument(
        "targets", nargs="*", help="test paths, node ids (path::name), or name patterns"
    )
    parser.add_argument("--all", action="store_true", help="run the full suite")
    parser.add_argument(
        "--cmd",
        help=(
            "run this command instead; targets are translated for pytest, jest, "
            "and go commands and appended verbatim otherwise"
        ),
    )
    parser.add_argument(
        "--repo-root", type=Path, help="project root (default: Git top level of cwd)"
    )
    parser.add_argument("--max-failures", type=int, default=20, metavar="N")
    parser.add_argument("--trace-lines", type=int, default=15, metavar="N")
    parser.add_argument(
        "--dry-run", action="store_true", help="print the command and exit"
    )
    args = parser.parse_args(argv)
    if args.all and args.targets:
        parser.error("--all runs the full suite; drop the targets or --all")
    if args.max_failures < 1 or args.trace_lines < 0:
        parser.error("--max-failures must be >= 1 and --trace-lines >= 0")
    return args


def repo_root(given: Path | None) -> Path:
    if given:
        if not given.is_dir():
            raise DetectError(f"--repo-root {given} is not a directory")
        return given.resolve()
    top = git(Path.cwd(), "rev-parse", "--show-toplevel")
    return Path(top.strip()).resolve() if top else Path.cwd().resolve()


def clip(line: str) -> str:
    return line if len(line) <= LINE_WIDTH else line[: LINE_WIDTH - 1] + "…"


def prefixed(prefix: str, path: str) -> str:
    if not prefix or not path or path.startswith("/"):
        return path
    return f"{prefix}/{path}"


def render_failure(
    n: int, failure: Failure, prefix: str, trace_lines: int
) -> list[str]:
    path = prefixed(prefix, failure.path) if failure.path else None
    lines = [f"### {n}. {path}::{failure.name}" if path else f"### {n}. {failure.name}"]
    if failure.location:
        lines.append(prefixed(prefix, failure.location))
    message = [m for m in failure.message if m.strip()]
    lines += [clip(m) for m in message[:MESSAGE_LINES]]
    if len(message) > MESSAGE_LINES:
        lines.append(f"(+{len(message) - MESSAGE_LINES} message lines)")
    trace = failure.trace[:trace_lines]
    if trace:
        lines += ["```", *(clip(t) for t in trace), "```"]
    return lines


def render(
    report: Report,
    run: RunOutput,
    prefix: str,
    elapsed: float,
    args: argparse.Namespace,
) -> tuple[list[str], int]:
    """Output lines after the header, and the exit code."""
    if report.crash:
        lines = [f"error: {report.crash}", "```", *map(clip, report.crash_lines), "```"]
        return lines, 2
    if not report.structured:
        tail = (run.stdout + run.stderr).splitlines()[-CRASH_LINES:]
        status = "passed" if run.code == 0 else "failed"
        lines = [
            f"{status} (exit {run.code}) in {elapsed:.1f}s; no per-test parsing for this runner",
            "```",
            *map(clip, tail),
            "```",
        ]
        return lines, 0 if run.code == 0 else 1
    summary = (
        f"{report.passed} passed, {report.failed} failed, {report.skipped} skipped, "
        f"{report.errors} errors in {elapsed:.1f}s"
    )
    if run.code != 0 and not report.failures:
        tail = (run.stdout + run.stderr).splitlines()[-CRASH_LINES:]
        headline = (
            f"error: runner exited {run.code} but reported no failures (output tail)"
        )
        return [summary, headline, "```", *map(clip, tail), "```"], 2
    if report.passed + report.failed + report.errors == 0:
        return [summary, "error: no tests ran for this selection"], 2
    lines = [summary]
    shown = report.failures[: args.max_failures]
    for n, failure in enumerate(shown, 1):
        lines += ["", *render_failure(n, failure, prefix, args.trace_lines)]
    if omitted := len(report.failures) - len(shown):
        lines += ["", f"... {omitted} more failures omitted (see log)"]
    return lines, 1 if report.failures else 0


def run_command(plan: Plan, argv: tuple[str, ...]) -> subprocess.CompletedProcess[str]:
    timeout = GODOT_TIMEOUT if plan.project.kind in GODOT_KINDS else None
    try:
        return subprocess.run(
            argv,
            cwd=plan.project.root,
            capture_output=True,
            text=True,
            errors="replace",
            env={**os.environ, **ENV},
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise DetectError(f"command not found: {argv[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise DetectError(
            f"runner timed out after {timeout}s: a failed assert() or a missing "
            "quit() leaves Godot running"
        ) from exc


def execute(plan: Plan, report_path: Path | None) -> tuple[RunOutput, float]:
    started = time.monotonic()
    if plan.setup:
        setup = run_command(plan, plan.setup)
        if setup.returncode != 0:
            tail = (setup.stdout + setup.stderr).splitlines()[-CRASH_LINES:]
            raise DetectError(
                f"setup failed (exit {setup.returncode}): "
                + "\n".join([shlex.join(plan.setup), *tail])
            )
    proc = run_command(plan, plan.argv)
    elapsed = time.monotonic() - started
    report = None
    if report_path and report_path.is_file():
        report = report_path.read_text(encoding="utf-8", errors="replace")
    return RunOutput(proc.stdout, proc.stderr, proc.returncode, report), elapsed


def write_log(log: Path, header: str, run: RunOutput, report_path: Path | None) -> None:
    parts = [f"$ {header}", run.stdout, "--- stderr ---", run.stderr]
    if report_path:
        parts.append(f"--- report: {report_path} ---")
    parts.append(f"--- exit {run.code} ---")
    log.write_text("\n".join(parts) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        repo = repo_root(args.repo_root)
        targets = [parse_target(t, repo, Path.cwd()) for t in args.targets]
        project = select_project(repo, targets, args.cmd)
        stem = Path(
            tempfile.gettempdir(), "claude-test-logs", time.strftime("%Y%m%d-%H%M%S")
        )
        stem = stem.with_name(f"{stem.name}-{os.getpid()}-{project.kind}")
        suffix = REPORT_SUFFIX.get(project.kind)
        report_path = stem.with_suffix(suffix) if suffix else None
        changes = None if targets or args.all or args.cmd else changed_files(repo)
        plan = build_plan(
            project,
            targets,
            changes,
            args.all,
            report_path or stem,
            custom=bool(args.cmd),
        )
        header = plan.display(repo)
        print(f"runner: {header}")
        print(f"scope: {plan.scope}")
        if args.dry_run:
            return 0
        stem.parent.mkdir(parents=True, exist_ok=True)
        run, elapsed = execute(plan, report_path)
    except DetectError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    log = stem.with_suffix(".log")
    write_log(log, header, run, report_path)
    prefix = "" if project.root == repo else rel(project.root, repo)
    lines, code = render(
        parse(project.kind, run, project.root), run, prefix, elapsed, args
    )
    print("\n".join(lines))
    print(f"log: {log}")
    return code


if __name__ == "__main__":
    sys.exit(main())
