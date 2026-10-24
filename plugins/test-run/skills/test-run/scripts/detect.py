"""Find the project's test runner and resolve the targets the user named."""

from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import tomllib
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path

SCAN_DEPTH = 2
SKIP_DIRS = {
    "node_modules",
    "vendor",
    "target",
    "dist",
    "build",
    "venv",
    "__pycache__",
    "bin",
    "obj",
}
JS_EXTS = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"}
GODOT_KINDS = {"gut", "gdunit4", "godot"}
KINDS_BY_EXT = {
    ".py": {"pytest"},
    ".go": {"go"},
    ".rs": {"cargo"},
    ".gd": GODOT_KINDS,
    ".cs": {"dotnet"},
    ".csproj": {"dotnet"},
    ".sln": {"dotnet"},
    ".slnx": {"dotnet"},
} | {ext: {"jest", "vitest", "npm"} for ext in JS_EXTS}
MAKEFILES = ("Makefile", "makefile", "GNUmakefile")


class DetectError(Exception):
    """A usage or detection failure; the CLI prints it and exits 2."""


@dataclass(frozen=True)
class Project:
    kind: str  # pytest | go | jest | vitest | npm | cargo | dotnet | gut | gdunit4 | godot | make | custom
    root: Path
    base: tuple[str, ...]
    mode: str = ""  # dotnet: vstest | bridge | mtp
    framework: str = ""  # dotnet: xunit3 | tunit | "" (filter-expression frameworks)
    entry: str = ""  # dotnet: the solution or project file passed to dotnet test


@dataclass(frozen=True)
class Target:
    raw: str
    path: Path | None  # absolute; None for a bare name pattern
    name: str | None  # test name or pattern
    recursive: bool = False  # Go "./pkg/..." form


def rel(path: Path, base: Path) -> str:
    return path.relative_to(base).as_posix() or "."


# --- targets ---


def parse_target(raw: str, repo: Path, cwd: Path) -> Target:
    def existing(text: str) -> Path | None:
        for base in (cwd, repo):
            candidate = base / text
            if candidate.exists():
                return candidate.resolve()
        return None

    if raw.endswith("/...") and (path := existing(raw.removesuffix("/..."))):
        return Target(raw, path, None, recursive=True)
    if "::" in raw:
        head, name = raw.split("::", 1)
        if path := existing(head):
            return Target(raw, path, name)
    elif path := existing(raw):
        return Target(raw, path, None)
    return Target(raw, None, raw)


# --- runner detection ---


def up_to_repo(directory: Path, repo: Path) -> list[Path]:
    """The directory and its ancestors, stopping at the repository root."""
    return [d for d in (directory, *directory.parents) if d.is_relative_to(repo)]


def package_manager(directory: Path, repo: Path) -> str:
    lockfiles = {
        "pnpm-lock.yaml": "pnpm",
        "bun.lock": "bun",
        "bun.lockb": "bun",
        "yarn.lock": "yarn",
        "package-lock.json": "npm",
    }
    for current in up_to_repo(directory, repo):
        for lockfile, manager in lockfiles.items():
            if (current / lockfile).is_file():
                return manager
    return "npm"


def exec_prefix(manager: str, binary: str) -> tuple[str, ...]:
    return {
        "pnpm": ("pnpm", "exec", binary),
        "bun": ("bun", "x", binary),
        "yarn": ("yarn", binary),
        "npm": ("npx", "--no", binary),
    }[manager]


def js_project(directory: Path, repo: Path) -> Project | None:
    manifest = directory / "package.json"
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DetectError(f"cannot read {manifest}: {exc}") from exc
    script = data.get("scripts", {}).get("test")
    if not script or "no test specified" in script:
        return None
    deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
    manager = package_manager(directory, repo)
    for binary in ("vitest", "jest"):
        if (
            binary in deps
            or binary in script
            or any(directory.glob(f"{binary}.config.*"))
        ):
            return Project(binary, directory, exec_prefix(manager, binary))
    run = ("bun", "run", "test") if manager == "bun" else (manager, "test")
    return Project("npm", directory, run)


def has_pytest(directory: Path) -> bool:
    pyproject = directory / "pyproject.toml"
    if pyproject.is_file():
        try:
            config = tomllib.loads(pyproject.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as exc:
            raise DetectError(f"cannot parse {pyproject}: {exc}") from exc
        if "pytest" in config.get("tool", {}):
            return True
    if (directory / "pytest.ini").is_file() or (directory / "conftest.py").is_file():
        return True
    tests = directory / "tests"
    packaged = pyproject.is_file() or (directory / "setup.py").is_file()
    return (
        packaged
        and tests.is_dir()
        and any(
            next(tests.rglob(pattern), None) for pattern in ("test_*.py", "*_test.py")
        )
    )


def pytest_base(directory: Path, repo: Path) -> tuple[str, ...]:
    if any((d / "uv.lock").is_file() for d in up_to_repo(directory, repo)):
        return ("uv", "run", "pytest")
    if (directory / ".venv/bin/python").is_file():
        return (".venv/bin/python", "-m", "pytest")
    return ("python3", "-m", "pytest")


# --- .NET ---

SOLUTION_EXTS = (".slnx", ".sln")
TEST_PROJECT = re.compile(
    r"Microsoft\.NET\.Test\.Sdk|MSTest|\bxunit|\bNUnit|\bTUnit|gdUnit4\.api"
    r"|<IsTestProject>\s*true",
    re.IGNORECASE,
)
SLN_PROJECT = re.compile(r'"([^"]+\.(?:cs|fs|vb)proj)"')
MTP_RUNNER = re.compile(
    r"<(?:EnableMSTestRunner|EnableNUnitRunner|UseMicrosoftTestingPlatformRunner)>"
    r"\s*true",
    re.IGNORECASE,
)
MTP_BRIDGE = re.compile(r"<TestingPlatformDotnetTestSupport>\s*true", re.IGNORECASE)


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def is_test_project(csproj: Path) -> bool:
    return bool(TEST_PROJECT.search(read(csproj))) or csproj.stem.endswith(
        ("Tests", "Test", "Specs")
    )


def solution_projects(solution: Path) -> list[Path]:
    names = SLN_PROJECT.findall(read(solution))
    return [solution.parent / n.replace("\\", "/") for n in names]


def dotnet_entries(directory: Path) -> list[Path]:
    """Solutions with a test project, else test projects, in one directory."""
    solutions = [
        f
        for ext in SOLUTION_EXTS
        for f in sorted(directory.glob(f"*{ext}"))
        if any(is_test_project(p) for p in solution_projects(f) if p.is_file())
    ]
    if solutions:
        return solutions
    return [p for p in sorted(directory.glob("*.csproj")) if is_test_project(p)]


def dotnet_project(directory: Path, repo: Path, entries: list[Path]) -> Project:
    """Pick VSTest, the VSTest-to-MTP bridge, or native MTP from the repo's settings."""
    native = False
    for current in up_to_repo(directory, repo):
        global_json = current / "global.json"
        if global_json.is_file():
            try:
                config = json.loads(read(global_json))
            except json.JSONDecodeError as exc:
                raise DetectError(f"cannot parse {global_json}: {exc}") from exc
            runner = (config.get("test") or {}).get("runner", "")
            native = runner == "Microsoft.Testing.Platform"
            break
    projects = [
        p
        for e in entries
        for p in (solution_projects(e) if e.suffix in SOLUTION_EXTS else [e])
        if p.is_file() and is_test_project(p)
    ]
    imports = [
        d / name
        for p in projects
        for d in up_to_repo(p.parent, repo)
        for name in ("Directory.Build.props", "Directory.Build.targets")
    ]
    text = "\n".join(read(f) for f in dict.fromkeys([*projects, *imports]))
    tunit = re.search(r'Include="TUnit', text, re.IGNORECASE) is not None
    mstest_sdk = 'Sdk="MSTest.Sdk' in text and not re.search(
        r"<UseVSTest>\s*true", text, re.IGNORECASE
    )
    runner = bool(MTP_RUNNER.search(text)) or mstest_sdk or tunit
    if native:
        mode = "mtp"
    elif runner and (tunit or MTP_BRIDGE.search(text)):
        mode = "bridge"
    else:
        mode = "vstest"
    if re.search(r'Include="xunit\.v3', text, re.IGNORECASE):
        framework = "xunit3"
    else:
        framework = "tunit" if tunit else ""
    entry = rel(entries[0], directory) if len(entries) == 1 else ""
    return Project("dotnet", directory, ("dotnet", "test"), mode, framework, entry)


# --- Godot ---

GODOT_TIMEOUT = 540  # seconds; a failed assert() or a missing quit() hangs Godot


def godot_binary() -> str:
    """GODOT_BIN, else godot, godot4 or godot-mono on PATH."""
    if given := os.environ.get("GODOT_BIN"):
        return given
    for name in ("godot", "godot4", "godot-mono"):
        if shutil.which(name):
            return name
    return "godot"


def godot_test_dir(directory: Path) -> str | None:
    for name in ("test", "tests"):
        if (directory / name).is_dir():
            return f"res://{name}"
    return None


def godot_project(directory: Path) -> Project | None:
    binary = godot_binary()
    if (directory / "addons/gut").is_dir():
        base = (binary, "--headless", "-s", "--path", ".", "addons/gut/gut_cmdln.gd")
        return Project("gut", directory, (*base, "-gexit"))
    if (directory / "addons/gdUnit4").is_dir():
        tool = "res://addons/gdUnit4/bin/GdUnitCmdTool.gd"
        debug = ("-d", "--remote-debug", "tcp://127.0.0.1:0")
        base = (binary, "--headless", "--path", ".", "-s", *debug, tool)
        return Project("gdunit4", directory, (*base, "--ignoreHeadlessMode", "-c"))
    for name in ("test", "tests"):
        if (directory / name / "test_runner.gd").is_file():
            script = f"res://{name}/test_runner.gd"
            base = (binary, "--headless", "--path", ".", "--script", script)
            return Project("godot", directory, base)
    return None


def detect_dir(directory: Path, repo: Path) -> list[Project]:
    """Projects in one directory, in detection order."""
    found = []
    if (directory / "package.json").is_file() and (js := js_project(directory, repo)):
        found.append(js)
    if has_pytest(directory):
        found.append(Project("pytest", directory, pytest_base(directory, repo)))
    if (directory / "go.mod").is_file():
        found.append(Project("go", directory, ("go", "test")))
    if (directory / "Cargo.toml").is_file():
        found.append(Project("cargo", directory, ("cargo", "test")))
    if (directory / "project.godot").is_file() and (godot := godot_project(directory)):
        found.append(godot)
    if entries := dotnet_entries(directory):
        found.append(dotnet_project(directory, repo, entries))
    if directory == repo and any(
        re.search(
            r"^test\s*:", (directory / name).read_text(encoding="utf-8"), re.MULTILINE
        )
        for name in MAKEFILES
        if (directory / name).is_file()
    ):
        found.append(Project("make", directory, ("make", "test")))
    return found


def scan(repo: Path) -> list[Project]:
    found, level = [], [repo]
    for depth in range(SCAN_DEPTH + 1):
        next_level = []
        for directory in level:
            found.extend(detect_dir(directory, repo))
            if depth < SCAN_DEPTH:
                next_level.extend(
                    child
                    for child in sorted(directory.iterdir())
                    if child.is_dir()
                    and not child.name.startswith(".")
                    and child.name not in SKIP_DIRS
                )
        level = next_level
    return found


def infer_kind(argv: list[str]) -> str:
    names = [Path(token).name for token in argv]
    pairs = set(pairwise(names))
    if "pytest" in names:
        return "pytest"
    if ("go", "test") in pairs:
        return "go"
    if ("cargo", "test") in pairs:
        return "cargo"
    if ("dotnet", "test") in pairs:
        return "dotnet"
    if any(n.endswith("gut_cmdln.gd") for n in names):
        return "gut"
    if any(n.endswith(("GdUnitCmdTool.gd", "runtest.sh")) for n in names):
        return "gdunit4"
    for kind in ("vitest", "jest"):
        if kind in names:
            return kind
    return "custom"


def for_path(found: list[Project], path: Path) -> Project:
    containing = sorted(
        (p for p in found if path.is_relative_to(p.root)),
        key=lambda p: len(p.root.parts),
        reverse=True,
    )
    if not containing:
        raise DetectError(f"no test project contains {path}")
    wanted = KINDS_BY_EXT.get(path.suffix) if path.is_file() else None
    if wanted:
        for project in containing:
            if project.kind in wanted:
                return project
    return containing[0]


def select_project(repo: Path, targets: list[Target], cmd: str | None) -> Project:
    if cmd:
        argv = shlex.split(cmd)
        if not argv:
            raise DetectError("--cmd is empty")
        return Project(infer_kind(argv), repo, tuple(argv))
    found = scan(repo)
    paths = [t.path for t in targets if t.path]
    if paths:
        chosen = {for_path(found, path) for path in paths}
        if len(chosen) > 1:
            roots = ", ".join(sorted(f"{rel(p.root, repo)} ({p.kind})" for p in chosen))
            raise DetectError(
                f"targets span several projects: {roots}; run each separately"
            )
        return chosen.pop()
    at_root = [p for p in found if p.root == repo]
    if at_root:
        return at_root[0]
    if len(found) == 1:
        return found[0]
    if not found:
        raise DetectError(f"no test runner found under {repo}; pass a target path or ask the user to approve run_custom.py --cmd")
    listing = "\n".join(f"  {rel(p.root, repo)}: {shlex.join(p.base)}" for p in found)
    raise DetectError(
        "several test projects found; pass a target path inside one of them, "
        f"or ask the user to approve run_custom.py --cmd:\n{listing}"
    )
