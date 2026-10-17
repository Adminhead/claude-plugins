"""Find the project's test runner and resolve the targets the user named."""

from __future__ import annotations

import json
import re
import shlex
import tomllib
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path

SCAN_DEPTH = 2
SKIP_DIRS = {"node_modules", "vendor", "target", "dist", "build", "venv", "__pycache__"}
JS_EXTS = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"}
KINDS_BY_EXT = {".py": {"pytest"}, ".go": {"go"}, ".rs": {"cargo"}} | {
    ext: {"jest", "vitest", "npm"} for ext in JS_EXTS
}
MAKEFILES = ("Makefile", "makefile", "GNUmakefile")


class DetectError(Exception):
    """A usage or detection failure; the CLI prints it and exits 2."""


@dataclass(frozen=True)
class Project:
    kind: str  # pytest | go | jest | vitest | npm | cargo | make | custom
    root: Path
    base: tuple[str, ...]


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
        raise DetectError(f"no test runner found under {repo}; pass --cmd")
    listing = "\n".join(f"  {rel(p.root, repo)}: {shlex.join(p.base)}" for p in found)
    raise DetectError(
        "several test projects found; pass a target path inside one of them, "
        f"or --cmd:\n{listing}"
    )
