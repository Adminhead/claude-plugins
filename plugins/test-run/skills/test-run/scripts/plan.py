"""Choose the tests to run and build the runner's command line."""

from __future__ import annotations

import json
import re
import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path

from detect import (
    GODOT_KINDS,
    JS_EXTS,
    SOLUTION_EXTS,
    DetectError,
    Project,
    Target,
    dotnet_entries,
    godot_test_dir,
    rel,
    up_to_repo,
)


@dataclass(frozen=True)
class Plan:
    project: Project
    argv: tuple[str, ...]
    scope: str
    setup: tuple[str, ...] = ()  # run first, e.g. the Godot import on a fresh checkout

    def display(self, repo: Path) -> str:
        cmd = shlex.join(self.argv)
        if self.project.root == repo:
            return cmd
        return f"cd {shlex.quote(rel(self.project.root, repo))} && {cmd}"


# --- affected tests ---


def git(repo: Path, *args: str) -> str | None:
    """Stdout of a Git command, or None when it fails."""
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), *args], capture_output=True, text=True, check=False
        )
    except FileNotFoundError as exc:
        raise DetectError("git is not installed; pass targets or --all") from exc
    return result.stdout if result.returncode == 0 else None


def default_branch(repo: Path) -> str | None:
    head = git(repo, "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD")
    if head:
        return head.strip().removeprefix("refs/remotes/")
    for name in ("main", "master"):
        for ref in (f"refs/heads/{name}", f"refs/remotes/origin/{name}"):
            if git(repo, "rev-parse", "--verify", "--quiet", ref) is not None:
                return ref.removeprefix("refs/heads/").removeprefix("refs/remotes/")
    return None


def changed_files(repo: Path) -> tuple[list[Path], str] | None:
    """Existing files changed vs the default branch, plus uncommitted and untracked.

    Returns None outside a Git repository or before the first commit.
    """
    if git(repo, "rev-parse", "--verify", "--quiet", "HEAD") is None:
        return None
    branch = default_branch(repo)
    merge_base = branch and git(repo, "merge-base", "HEAD", branch)
    if merge_base:
        base, label = merge_base.strip(), f"changed vs {branch}"
    else:
        base, label = "HEAD", "uncommitted (no default branch found)"
    diff = git(repo, "diff", "--name-only", "--relative", base) or ""
    untracked = git(repo, "ls-files", "--others", "--exclude-standard") or ""
    names = dict.fromkeys((diff + untracked).splitlines())
    files = [repo / name for name in names if name and (repo / name).is_file()]
    return files, label


def last_failed(root: Path) -> list[str]:
    cache = root / ".pytest_cache/v/cache/lastfailed"
    if not cache.is_file():
        return []
    try:
        node_ids = json.loads(cache.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DetectError(f"cannot parse {cache}: {exc}") from exc
    return [n for n in node_ids if (root / n.split("::", 1)[0]).is_file()]


def affected(project: Project, files: list[Path]) -> list[str] | None:
    """Selection args for the changed files, or None when the runner can't map them."""
    root = project.root
    files = [f for f in files if f.is_relative_to(root)]
    if project.kind == "pytest":
        items = []
        for f in files:
            if f.suffix == ".py" and (
                f.name.startswith("test_") or f.stem.endswith("_test")
            ):
                items.append(rel(f, root))
            elif f.name == "conftest.py":
                items.append(rel(f.parent, root))
        return list(dict.fromkeys(items + last_failed(root)))
    if project.kind == "go":
        dirs = dict.fromkeys(rel(f.parent, root) for f in files if f.suffix == ".go")
        return [d if d == "." else f"./{d}" for d in dirs]
    if project.kind in {"jest", "vitest"}:
        return [rel(f, root) for f in files if f.suffix in JS_EXTS]
    return None


# --- command building ---


def report_args(kind: str, report: Path) -> list[str]:
    return {
        "pytest": [
            "-q",
            "--tb=short",
            f"--junitxml={report}",
            "-o",
            "junit_family=xunit1",
        ],
        "go": ["-json"],
        "jest": ["--ci", "--json", f"--outputFile={report}", "--testLocationInResults"],
        "vitest": ["--reporter=json", f"--outputFile={report}"],
        "gut": [f"-gjunit_xml_file={report}"],
    }.get(kind, [])


# --- .NET selection ---

VSTEST_SPECIAL = re.compile(r"([\\(),&|=!~])")


def dotnet_entry(path: Path, project: Project) -> str:
    """The solution or test project that covers a target path."""
    root = project.root
    if path.is_file() and path.suffix in {*SOLUTION_EXTS, ".csproj"}:
        return rel(path, root)
    start = path if path.is_dir() else path.parent
    for directory in up_to_repo(start, root):
        if directory == root:
            return project.entry
        entries = dotnet_entries(directory)
        if len(entries) > 1:
            names = ", ".join(rel(e, root) for e in entries)
            raise DetectError(
                f"several .NET entries in {rel(directory, root)}: {names}"
            )
        if entries:
            return rel(entries[0], root)
    return project.entry


def dotnet_filter(project: Project, names: list[str]) -> list[str]:
    """Name filters in the syntax the project's platform and framework accept."""
    names = [re.split(r"[(<]", n, maxsplit=1)[0].strip() for n in names]
    if project.mode == "vstest" or project.framework == "":
        escaped = [VSTEST_SPECIAL.sub(r"\\\1", n) for n in names]
        args = ["--filter", "|".join(f"FullyQualifiedName~{n}" for n in escaped)]
    elif project.framework == "xunit3":
        args = [a for n in names for a in ("--filter-method", f"*{n}*")]
    else:  # TUnit tree-node filter: /assembly/namespace/class/test
        if len(names) > 1:
            raise DetectError(
                "TUnit takes one --treenode-filter; rerun one test at a time"
            )
        parts = names[0].split(".")
        node = "/".join(parts[-2:]) if len(parts) > 1 else f"*/{parts[0]}"
        args = ["--treenode-filter", f"/*/*/{node}"]
    return ["--", *args] if project.mode == "bridge" else args


def dotnet_args(project: Project, targets: list[Target]) -> list[str]:
    paths = [t.path for t in targets if t.path and t.path != project.root]
    entries = list(dict.fromkeys(dotnet_entry(p, project) for p in paths))
    if len(entries) > 1:
        raise DetectError(
            "dotnet test takes one solution or project; run each target separately"
        )
    entry = entries[0] if entries else project.entry
    args = []
    if entry and project.mode == "mtp":
        args += ["--solution" if entry.endswith(SOLUTION_EXTS) else "--project", entry]
    elif entry:
        args.append(entry)
    names = [t.name for t in targets if t.name]
    return args + (dotnet_filter(project, names) if names else [])


# --- Godot selection ---


def godot_default(project: Project) -> list[str]:
    test_dir = godot_test_dir(project.root)
    if project.kind == "gdunit4":
        return ["-a", test_dir or "res://"]
    if project.kind == "gut" and not (project.root / ".gutconfig.json").is_file():
        return [f"-gdir={test_dir}", "-ginclude_subdirs"] if test_dir else []
    return []


def godot_args(project: Project, targets: list[Target]) -> list[str]:
    root = project.root
    paths = [t.path for t in targets if t.path and t.path != root]
    if project.kind == "gdunit4":
        if any(not t.path for t in targets):
            raise DetectError(
                "gdUnit4 selects tests by suite path; pass a test file or directory"
            )
        suites = dict.fromkeys(f"res://{rel(p, root)}" for p in paths)
        return [a for s in suites for a in ("-a", s)] or godot_default(project)
    dirs = [f"res://{rel(p, root)}" for p in paths if p.is_dir()]
    files = [f"res://{rel(p, root)}" for p in paths if p.is_file()]
    args = []
    if dirs:
        args += [f"-gdir={','.join(dirs)}", "-ginclude_subdirs"]
    if files:
        args.append(f"-gtest={','.join(files)}")
    if not args:
        args = godot_default(project)
    names = {t.name for t in targets if t.name}
    if len(names) == 1:
        args.append(f"-gunit_test_name={names.pop()}")
    return args


def name_regex(kind: str, names: list[str]) -> str:
    """A -t regex for failure names; jest joins name parts with spaces, vitest with " > "."""
    parts = (n.replace(" > ", " ") if kind == "jest" else n for n in names)
    return "|".join(re.escape(p).replace("\\ ", " ") for p in parts)


def target_args(project: Project, targets: list[Target]) -> list[str]:
    kind, root = project.kind, project.root
    paths = [t for t in targets if t.path and t.path != root]
    names = [t.name for t in targets if t.name and t.path]
    patterns = [t.raw for t in targets if not t.path]
    if kind == "pytest":
        ids = [rel(t.path, root) + (f"::{t.name}" if t.name else "") for t in paths]
        return ids + (["-k", " or ".join(patterns)] if patterns else [])
    if kind == "go":
        packages = []
        for t in paths:
            directory = t.path if t.path.is_dir() else t.path.parent
            package = "." if directory == root else f"./{rel(directory, root)}"
            packages.append(f"{package}/..." if t.recursive else package)
        exact = [n.split("/", 1)[0] for n in names]
        run = "|".join(([f"^({'|'.join(exact)})$"] if exact else []) + patterns)
        return (["-run", run] if run else []) + (
            list(dict.fromkeys(packages)) or ["./..."]
        )
    if kind in {"jest", "vitest"}:
        files = list(dict.fromkeys(rel(t.path, root) for t in paths))
        regex = "|".join(filter(None, [name_regex(kind, names), "|".join(patterns)]))
        return files + (["-t", regex] if regex else [])
    if kind == "dotnet":
        return dotnet_args(project, targets)
    if kind in {"gut", "gdunit4"}:
        return godot_args(project, targets)
    if kind == "cargo":
        binaries, filters = [], []
        for t in targets:
            if t.name:
                filters.append(t.raw)
            elif t.path and t.path.suffix == ".rs" and t.path.parent.name == "tests":
                binaries += ["--test", t.path.stem]
            elif t.path != root:
                raise DetectError(
                    f"cargo can't select tests by path {t.raw}; pass a test name"
                )
        return binaries + (["--", *filters] if filters else [])
    raise DetectError(
        f"the {kind} runner can't select tests; use run_custom.py --cmd with the selection"
    )


def build_plan(
    project: Project,
    targets: list[Target],
    changes: tuple[list[Path], str] | None,
    run_all: bool,
    report: Path,
    custom: bool,
) -> Plan:
    kind, base = project.kind, list(project.base)
    if custom:
        # These runners take selection flags in any position, so ids still work.
        if targets and kind in {"pytest", "jest", "go"}:
            extra = target_args(project, targets)
        else:
            extra = [t.raw for t in targets]
        argv = base + report_args(kind, report) + extra
        return Plan(project, tuple(argv), "custom command")
    if targets:
        mode, scope = "targets", "targets: " + ", ".join(t.raw for t in targets)
        selection = target_args(project, targets)
    elif run_all:
        mode, scope, selection = "full", "full suite (--all)", []
    elif changes is None:
        mode, scope, selection = "full", "full suite (no Git history to diff)", []
    else:
        files, label = changes
        mapped = affected(project, files)
        if mapped is None:
            mode, selection = "full", []
            scope = f"full suite ({kind} has no affected-test mapping)"
        elif not mapped:
            mode, selection = "full", []
            scope = f"full suite (no {label} files map to tests)"
        else:
            mode, selection = "affected", mapped
            scope = f"affected: {len(files)} files {label} -> {len(mapped)} selections"

    reporting = report_args(kind, report)
    setup: tuple[str, ...] = ()
    if kind in GODOT_KINDS and not (project.root / ".godot").is_dir():
        setup = (base[0], "--headless", "--path", ".", "--import")
        scope += "; imports the project first (no .godot/)"
    if kind == "dotnet" and mode != "targets":
        selection = dotnet_args(project, [])
    elif kind in {"gut", "gdunit4"} and mode != "targets":
        selection = godot_default(project)
    if kind == "vitest":
        if mode == "affected":
            argv = [*base, "related", *selection, "--run", "--passWithNoTests"]
        else:
            argv = [*base, "run", *selection]
        argv += reporting
    elif kind == "jest" and mode == "affected":
        argv = [
            *base,
            *reporting,
            "--findRelatedTests",
            *selection,
            "--passWithNoTests",
        ]
    elif kind == "go":
        argv = [*base, *reporting, *(selection or ["./..."])]
    elif kind == "cargo":
        argv = [*base, "--no-fail-fast", *selection]
    else:
        argv = [*base, *reporting, *selection]
    return Plan(project, tuple(argv), scope, setup)
