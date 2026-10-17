#!/usr/bin/env python3
"""Scan the current branch's changes and dependencies; print a compact findings summary.

Runs gitleaks, semgrep, trivy, govulncheck, and pip-audit where they apply,
normalizes and deduplicates their findings, writes the full list as JSON to a
temp file, and prints a Markdown summary whose last line is that file's path.
Every tool that cannot run is reported as a "not scanned" gap.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import normalize as nz
from scanners import (
    TOOLS,
    Context,
    Outcome,
    ToolFailure,
    error_line,
    run,
    scan_dependencies,
    scan_gitleaks,
    scan_govulncheck,
    scan_semgrep,
)

BASE_CANDIDATES = ("origin/HEAD", "origin/main", "origin/master", "main", "master")
TABLE_ROWS = 40


class UsageError(Exception):
    """A bad argument or repository state; main() prints it and exits 2."""


# --- git ---


def git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return run(["git", "-C", str(root), *args], root, 60)


def git_paths(root: Path, *args: str) -> list[str]:
    proc = git(root, *args, "-z")
    if proc.returncode != 0:
        raise UsageError(f"git {args[0]} failed: {error_line(proc)}")
    return [path for path in proc.stdout.split("\0") if path]


def resolve_base(root: Path, requested: str | None) -> tuple[str, str]:
    if requested and requested.startswith("-"):
        raise UsageError(f"invalid base ref {requested!r}")
    for ref in [requested] if requested else BASE_CANDIDATES:
        if git(
            root, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"
        ).returncode:
            if requested:
                raise UsageError(f"base ref {requested!r} does not exist")
            continue
        merge_base = git(root, "merge-base", ref, "HEAD")
        if merge_base.returncode:
            raise UsageError(f"{ref} shares no history with HEAD")
        return ref, merge_base.stdout.strip()
    tried = ", ".join(BASE_CANDIDATES)
    raise UsageError(f"no base ref found (tried {tried}); pass one explicitly")


def build_context(root: Path, requested: str | None) -> Context:
    top = git(root, "rev-parse", "--show-toplevel")
    if top.returncode:
        raise UsageError(f"{root} is not inside a Git repository")
    root = Path(top.stdout.strip())
    if git(root, "rev-parse", "--verify", "--quiet", "HEAD").returncode:
        raise UsageError("the repository has no commits yet")
    base, merge_base = resolve_base(root, requested)
    untracked = git_paths(root, "ls-files", "--others", "--exclude-standard")
    changed = git_paths(root, "diff", "--name-only", "--diff-filter=d", merge_base)
    uncommitted = git_paths(root, "diff", "--name-only", "--diff-filter=d", "HEAD")
    tracked = git_paths(root, "ls-files")
    return Context(
        root=root,
        base=base,
        merge_base=merge_base,
        changed=frozenset(changed + untracked),
        uncommitted=tuple(sorted(set(uncommitted + untracked))),
        files=tuple(sorted(set(tracked + untracked))),
    )


# --- orchestration and output ---


def guarded(name: str, scan: Callable[[], Outcome]) -> Outcome:
    """Run one scanner; any failure becomes a visible gap, never a crash."""
    try:
        return scan()
    except ToolFailure as exc:
        return Outcome(gaps=[f"{name}: {exc}"])
    except Exception as exc:  # noqa: BLE001 - reported as a gap so other scanners' results survive
        return Outcome(gaps=[f"{name}: internal error {type(exc).__name__}: {exc}"])


def scan_all(ctx: Context, skip: set[str]) -> Outcome:
    jobs = {
        "gitleaks": lambda: scan_gitleaks(ctx),
        "semgrep": lambda: scan_semgrep(ctx),
        "dependencies": lambda: scan_dependencies(ctx, skip),
        "govulncheck": lambda: scan_govulncheck(ctx),
    }
    total = Outcome(
        gaps=[f"{name}: skipped by --skip" for name in jobs if name in skip]
    )
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = [
            pool.submit(guarded, name, job)
            for name, job in jobs.items()
            if name not in skip
        ]
        for future in futures:
            result = future.result()
            total.runs += result.runs
            total.gaps += result.gaps
            total.findings += result.findings
    total.findings = nz.rank(nz.dedupe(total.findings))
    return total


def cell(text: str, limit: int) -> str:
    return nz.clip(text, limit).replace("|", "\\|")


def render(ctx: Context, result: Outcome, seconds: float, json_path: str) -> str:
    findings = result.findings
    counts = {s: sum(f.severity == s for f in findings) for s in nz.SEVERITIES}
    tally = ", ".join(f"{n} {s}" for s, n in counts.items() if n) or "none"
    on_branch = sum(f.changed_on_branch for f in findings)
    changed = len(ctx.changed)
    lines = [
        "## Audit scan",
        f"- Base: {ctx.base} (merge-base {ctx.merge_base[:10]}); {changed} files changed",
        f"- Tools ({seconds:.1f}s total): " + ("; ".join(result.runs) or "none ran"),
        "- Not scanned: " + ("; ".join(result.gaps) or "nothing"),
        f"- Findings: {len(findings)} ({tally}); {on_branch} touch branch changes",
    ]
    if findings:
        lines += [
            "",
            "| id | sev | tool | location | issue | fix | new |",
            "|---|---|---|---|---|---|---|",
        ]
        for f in findings[:TABLE_ROWS]:
            issue = (f"[{f.reachability}] " if f.reachability else "") + f.title
            lines.append(
                f"| {f.id} | {f.severity} | {f.tool} | {cell(f.location, 70)} "
                f"| {cell(issue, 90)} | {cell(f.fixed_version, 20)} "
                f"| {'yes' if f.changed_on_branch else ''} |"
            )
        if len(findings) > TABLE_ROWS:
            lines.append(
                f"\n{len(findings) - TABLE_ROWS} more findings omitted; see the JSON."
            )
    lines.append(f"\nFull findings JSON: {json_path}")
    return "\n".join(lines)


def write_json(ctx: Context, result: Outcome) -> str:
    fd, path = tempfile.mkstemp(prefix="audit-findings-", suffix=".json")
    payload = {
        "repo": str(ctx.root),
        "base": ctx.base,
        "merge_base": ctx.merge_base,
        "changed_files": sorted(ctx.changed),
        "tools": result.runs,
        "gaps": result.gaps,
        "findings": [f.to_json() for f in result.findings],
    }
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=1)
    return path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "base_ref",
        nargs="?",
        help="compare against this ref (default: origin/HEAD, then main)",
    )
    parser.add_argument(
        "--repo-root", type=Path, default=Path.cwd(), help="repository to scan"
    )
    parser.add_argument(
        "--skip",
        action="append",
        choices=TOOLS,
        default=[],
        metavar="TOOL",
        help=f"skip a scanner (repeatable): {', '.join(TOOLS)}",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    started = time.monotonic()
    try:
        ctx = build_context(args.repo_root.resolve(), args.base_ref)
    except (UsageError, ToolFailure) as exc:
        print(f"audit: {exc}", file=sys.stderr)
        return 2
    result = scan_all(ctx, set(args.skip))
    json_path = write_json(ctx, result)
    print(render(ctx, result, time.monotonic() - started, json_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
