"""Run each scanner against a repository context and collect normalized findings.

A scanner raises ToolFailure when it cannot run or finish; the caller records
that as a "not scanned" gap.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import normalize as nz

TOOL_TIMEOUT_SECONDS = {
    "gitleaks": 180,
    "semgrep": 300,
    "trivy": 300,
    "govulncheck": 300,
    "pip-audit": 300,
}
TOOLS = tuple(TOOL_TIMEOUT_SECONDS)
GOVULNCHECK = "golang.org/x/vuln/cmd/govulncheck@latest"
SNIPPET_LINES = 3
SKIP_PARTS = {"node_modules", "vendor", "testdata", ".venv"}
PYTHON_MANIFEST = re.compile(
    r"^(pyproject\.toml|setup\.py|setup\.cfg|Pipfile|poetry\.lock|uv\.lock|requirements.*\.txt)$"
)
OTHER_MANIFESTS = {
    "package.json": ("npm", "npm audit also needs a lockfile"),
    "Cargo.toml": ("rust", "cargo-audit also needs Cargo.lock"),
    "Gemfile": ("ruby", ""),
    "composer.json": ("php", ""),
    "pom.xml": ("java", ""),
    "build.gradle": ("java", ""),
    "build.gradle.kts": ("java", ""),
}


class ToolFailure(Exception):
    """A scanner could not run or finish; recorded as a gap."""


@dataclass
class Outcome:
    runs: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    findings: list[nz.Finding] = field(default_factory=list)


@dataclass(frozen=True)
class Context:
    root: Path
    base: str
    merge_base: str
    changed: frozenset[str]
    uncommitted: tuple[str, ...]
    files: tuple[str, ...]


# --- processes ---


def run(
    cmd: list[str],
    cwd: Path,
    timeout: float,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ToolFailure(f"{cmd[0]} is not installed") from exc
    except subprocess.TimeoutExpired as exc:
        raise ToolFailure(f"timed out after {timeout:.0f}s") from exc


def error_line(proc: subprocess.CompletedProcess[str]) -> str:
    lines = [line for line in (proc.stderr or proc.stdout).splitlines() if line.strip()]
    last = lines[-1] if lines else "no output"
    return f"exit {proc.returncode}: {nz.redact(nz.clip(last, 200))}"


def checked(
    proc: subprocess.CompletedProcess[str], ok: tuple[int, ...] = (0,)
) -> subprocess.CompletedProcess[str]:
    if proc.returncode not in ok:
        raise ToolFailure(error_line(proc))
    return proc


def tool_version(tool: str, version_args: list[str], cwd: Path) -> str:
    """Return the tool's version, or raise ToolFailure when it is missing or won't run."""
    if shutil.which(tool) is None:
        raise ToolFailure(f"{tool} is not installed")
    probe = run([tool, *version_args], cwd, 30)
    if probe.returncode != 0:
        # Version probes put the cause first; later lines are hints like "run with --verbose".
        first = next(
            (ln for ln in probe.stderr.splitlines() if ln.strip()), "no output"
        )
        reason = nz.redact(nz.clip(first.strip(), 200))
        raise ToolFailure(
            f"{tool} is installed but not usable (exit {probe.returncode}: {reason})"
        )
    match = re.search(r"\d+\.\d+\.\d+\S*", probe.stdout)
    return match.group(0) if match else "unknown version"


def timed(name: str, version: str, started: float) -> str:
    return f"{name} {version} ({time.monotonic() - started:.1f}s)"


def existing(ctx: Context, paths: list[str] | tuple[str, ...]) -> list[str]:
    return [
        p for p in paths if (ctx.root / p).is_file() and not (ctx.root / p).is_symlink()
    ]


def read_lines(root: Path, path: str, start: int, end: int) -> str:
    try:
        lines = (root / path).read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        return f"(unreadable: {exc.strerror})"
    return "\n".join(lines[start - 1 : min(end, start + SNIPPET_LINES - 1)])


# --- scanners ---


def scan_gitleaks(ctx: Context) -> Outcome:
    out, started = Outcome(), time.monotonic()
    version = tool_version("gitleaks", ["version"], ctx.root)
    common = ["--redact", "--no-banner", "--log-level", "error", "--exit-code", "0"]
    common += ["--report-format", "json"]
    timeout = TOOL_TIMEOUT_SECONDS["gitleaks"]
    with tempfile.TemporaryDirectory(prefix="audit-gitleaks-") as tmp:
        report = Path(tmp, "git.json")
        log_range = f"{ctx.merge_base}..HEAD"
        cmd = ["gitleaks", "git", str(ctx.root), f"--log-opts={log_range}", *common]
        checked(run([*cmd, "--report-path", str(report)], ctx.root, timeout))
        out.findings += nz.parse_gitleaks(json.loads(report.read_text() or "[]"))

        # gitleaks dir sees only files on disk, so copy the uncommitted changes.
        pending = existing(ctx, ctx.uncommitted)
        if pending:
            copy = Path(tmp, "tree")
            for path in pending:
                (copy / path).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ctx.root / path, copy / path)
            config = ctx.root / ".gitleaks.toml"
            extra = ["--config", str(config)] if config.is_file() else []
            report = Path(tmp, "dir.json")
            cmd = ["gitleaks", "dir", str(copy), *common, *extra]
            checked(run([*cmd, "--report-path", str(report)], ctx.root, timeout))
            found = json.loads(report.read_text() or "[]")
            out.findings += nz.parse_gitleaks(found, strip_prefix=str(copy))
    out.runs.append(timed("gitleaks", version, started))
    return out


def scan_semgrep(ctx: Context) -> Outcome:
    out, started = Outcome(), time.monotonic()
    targets = existing(ctx, sorted(ctx.changed))
    if not targets:
        out.runs.append("semgrep (skipped: no changed files)")
        return out
    version = tool_version("semgrep", ["--version"], ctx.root)

    # semgrep-core's io_uring backend fails in sandboxes and under low memlock limits.
    env = {**os.environ, "EIO_BACKEND": "posix"}
    cmd = [
        "semgrep",
        "scan",
        "--config",
        "p/default",
        "--baseline-commit",
        ctx.merge_base,
    ]
    cmd += [
        "--json",
        "--metrics=off",
        "--disable-version-check",
        "--quiet",
        "--",
        *targets,
    ]
    proc = checked(run(cmd, ctx.root, TOOL_TIMEOUT_SECONDS["semgrep"], env), ok=(0, 1))
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise ToolFailure(error_line(proc)) from exc
    findings, errors = nz.parse_semgrep(
        data, lambda path, start, end: read_lines(ctx.root, path, start, end)
    )
    out.findings += findings
    if errors:
        out.gaps.append(f"semgrep: {len(errors)} scan errors, first: {errors[0]}")
    out.runs.append(timed("semgrep", version, started))
    return out


def manifest_dirs(ctx: Context, match: Callable[[str], bool]) -> list[str]:
    dirs = set()
    for path in ctx.files:
        parts = Path(path).parts
        if match(parts[-1]) and not SKIP_PARTS & set(parts):
            dirs.add(str(Path(path).parent))
    return sorted(dirs)


def covered(directory: str, ecosystem: str, targets: list[tuple[str, str]]) -> bool:
    """A lockfile trivy read in this directory or an ancestor covers the manifest."""
    here = Path(directory)
    for eco, target in targets:
        parent = Path(target).parent
        if eco == ecosystem and (here == parent or parent in here.parents):
            return True
    return False


def scan_trivy(ctx: Context, out: Outcome) -> list[tuple[str, str]]:
    started = time.monotonic()
    version = tool_version("trivy", ["--version"], ctx.root)
    with tempfile.TemporaryDirectory(prefix="audit-trivy-") as tmp:
        report = Path(tmp, "trivy.json")
        cmd = ["trivy", "fs", "--scanners", "vuln", "--format", "json", "--quiet"]
        cmd += ["--list-all-pkgs=false", "--output", str(report), str(ctx.root)]
        checked(run(cmd, ctx.root, TOOL_TIMEOUT_SECONDS["trivy"]))
        findings, targets = nz.parse_trivy(
            json.loads(report.read_text()), set(ctx.changed)
        )
    out.findings += findings
    out.runs.append(timed("trivy", version, started))
    return targets


def pip_audit_jobs(
    ctx: Context, directory: str, tmp: Path
) -> list[tuple[str, list[str]]]:
    """Return (audited file, pip-audit arguments) pairs for one Python project."""
    here = ctx.root / directory
    if (here / "uv.lock").is_file():
        exported = tmp / f"{len(list(tmp.iterdir()))}-requirements.txt"
        cmd = ["uv", "export", "--frozen", "--format", "requirements-txt"]
        cmd += ["--no-hashes", "--no-emit-project", "--all-extras", "--all-groups"]
        checked(
            run([*cmd, "-o", str(exported)], here, TOOL_TIMEOUT_SECONDS["pip-audit"])
        )
        args = ["-r", str(exported), "--no-deps", "--disable-pip"]
        return [(str(Path(directory, "uv.lock")), args)]
    requirements = sorted(here.glob("requirements*.txt"))
    if requirements:
        return [
            (str(Path(directory, req.name)), ["-r", str(req)]) for req in requirements
        ]
    for name in ("pyproject.toml", "setup.py"):
        if (here / name).is_file():
            return [(str(Path(directory, name)), [str(here)])]
    raise ToolFailure("only Pipfile/poetry.lock found, which pip-audit cannot read")


def scan_pip_audit(ctx: Context, directories: list[str], out: Outcome) -> None:
    started, timeout = time.monotonic(), TOOL_TIMEOUT_SECONDS["pip-audit"]
    base = ["uvx", "pip-audit"]
    version = checked(run([*base, "--version"], ctx.root, timeout)).stdout.split()[-1]
    flags = ["--format", "json", "--progress-spinner", "off", "--desc", "off"]
    with tempfile.TemporaryDirectory(prefix="audit-pip-") as tmp:
        for directory in directories:
            try:
                for target, args in pip_audit_jobs(ctx, directory, Path(tmp)):
                    proc = run([*base, *args, *flags], ctx.root, timeout)
                    data = json.loads(checked(proc, ok=(0, 1)).stdout)
                    changed = set(ctx.changed)
                    out.findings += nz.parse_pip_audit(data, target, changed)
            except (ToolFailure, json.JSONDecodeError) as exc:
                out.gaps.append(f"pip-audit in {directory}: {exc}")
    out.runs.append(timed("pip-audit", version, started))


def scan_dependencies(ctx: Context, skip: set[str]) -> Outcome:
    out, targets, trivy_ran = Outcome(), [], False
    if "trivy" in skip:
        out.gaps.append("trivy: skipped by --skip")
    else:
        try:
            targets, trivy_ran = scan_trivy(ctx, out), True
        except (ToolFailure, json.JSONDecodeError) as exc:
            out.gaps.append(f"trivy: {exc}")

    python = [
        d
        for d in manifest_dirs(ctx, PYTHON_MANIFEST.match)
        if not covered(d, "pypi", targets)
    ]
    if python and "pip-audit" in skip:
        out.gaps.append(f"pip-audit: skipped by --skip (uncovered Python in {python})")
    elif python:
        try:
            scan_pip_audit(ctx, python, out)
        except ToolFailure as exc:
            out.gaps.append(f"pip-audit: {exc}")

    for name, (ecosystem, hint) in OTHER_MANIFESTS.items():
        dirs = [
            d
            for d in manifest_dirs(ctx, name.__eq__)
            if not covered(d, ecosystem, targets)
        ]
        if dirs:
            shown = ", ".join(dirs[:3]) + (
                f" (+{len(dirs) - 3} more)" if len(dirs) > 3 else ""
            )
            if not trivy_ran:
                reason = "trivy did not run"
            else:
                reason = "no lockfile trivy analyzed" + (f"; {hint}" if hint else "")
            out.gaps.append(f"{ecosystem} dependencies in {shown}: {reason}")
    return out


def scan_govulncheck(ctx: Context) -> Outcome:
    out = Outcome()
    modules = manifest_dirs(ctx, "go.mod".__eq__)
    if not modules:
        return out
    started, version = time.monotonic(), ""
    for module in modules:
        label = module if module != "." else "repo root"
        try:
            cmd = ["go", "run", GOVULNCHECK, "-json", "./..."]
            proc = checked(
                run(cmd, ctx.root / module, TOOL_TIMEOUT_SECONDS["govulncheck"])
            )
            findings, version = nz.parse_govulncheck(
                proc.stdout, module, set(ctx.changed)
            )
            out.findings += findings
        except (ToolFailure, json.JSONDecodeError) as exc:
            out.gaps.append(
                f"govulncheck in {label}: {exc} (trivy still checks go.mod versions)"
            )
    out.runs.append(timed("govulncheck", version or "(no successful run)", started))
    return out
