#!/usr/bin/env python3
"""Map a repository's source files against its tests, to give coverage gaps evidence.

Derived from the test-gap-audit skill in github/awesome-copilot (MIT).

Read-only and standard library only. Runs no tests and writes nothing. The only
subprocesses are `git ls-files` and `git rev-parse`.

    python3 coverage_map.py [--repo PATH] [--format text|json] [--top N] [--no-git-root]

A source file counts as matched when a test matches it by name, by mirrored path,
by import, or (weakly) by mention. Matching is heuristic: coverage that arrives
through fixtures, end-to-end tests, or indirection is invisible here. An unmatched
file is a lead to confirm by hand, never a finding on its own.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

GIT_TIMEOUT = 30
MAX_READ_BYTES = 400_000

IGNORED_DIRS = {
    ".git", "node_modules", "vendor", "venv", ".venv", "__pycache__", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", ".tox", "dist", "build", "target", "out", ".next",
    ".nuxt", ".terraform", "coverage",
}
SOURCE_EXTS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".go", ".rs",
    ".rb", ".php", ".java", ".kt", ".swift", ".scala", ".cs", ".ex", ".exs", ".dart",
}
# Entry-point glue, config, and generated files carry little testable logic.
NON_LOGIC = re.compile(
    r"(^|/)(setup|conftest|__init__|index|main|migrations?)\.[A-Za-z]+$"
    r"|\.(config|d)\.[A-Za-z]+$"
    r"|(^|/)(migrations|__generated__|generated|\.storybook)/",
    re.IGNORECASE,
)
# A file is a test when its name says so, or it sits in a test directory. Names like
# integration/ and e2e/ also hold production code when nested, so they count only at the root.
TEST_FILE_NAME = re.compile(
    r"(^|/)[^/]*[._-](test|spec)s?\.[A-Za-z0-9]+$|(^|/)test_[^/]*\.[A-Za-z0-9]+$", re.IGNORECASE
)
ANY_DEPTH_TEST_DIRS = {"test", "tests", "__tests__"}
ROOT_TEST_DIRS = ANY_DEPTH_TEST_DIRS | {"spec", "specs", "e2e", "integration", "cypress", "playwright"}


def is_test_path(rel: str) -> bool:
    parts = rel.split("/")[:-1]
    return bool(
        TEST_FILE_NAME.search(rel)
        or any(p in ANY_DEPTH_TEST_DIRS for p in parts)
        or (parts and parts[0] in ROOT_TEST_DIRS)
    )


# A file is a test by name, as opposed to a helper that merely lives under tests/.
TEST_NAME = re.compile(r"([._-](test|spec)s?$)|(^test_)", re.IGNORECASE)

FRAMEWORKS = [
    "vitest", "jest", "mocha", "playwright", "cypress", "pytest", "unittest",
    "rspec", "minitest", "phpunit", "junit", "xunit", "nunit", "exunit",
]
MANIFESTS = {
    "package.json", "pyproject.toml", "requirements.txt", "Gemfile", "composer.json",
    "pom.xml", "build.gradle", "mix.exs", "Cargo.toml", "go.mod",
}

ASSERTION = re.compile(
    r"\b(expect|assert\w*|should|toBe\w*|toEqual|toThrow|toHaveBeenCalled\w*|"
    r"refute|must_equal|verify)\b"
)
# Test cases only. describe/context/class are grouping and would inflate the count.
TEST_CASE = re.compile(r"^\s*(?:(?:it|test|scenario)\b|def test_|func Test|@Test\b)", re.MULTILINE)

RISK_KEYWORDS = (
    "auth", "login", "session", "token", "password", "permission", "role", "admin",
    "billing", "payment", "invoice", "subscription", "checkout", "charge", "refund",
    "migration", "delete", "destroy", "export", "import", "webhook", "crypto", "wallet",
    "security", "secret", "upload",
)
IMPORT_RES = [
    re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]"""),
    re.compile(r"""require\(\s*['"]([^'"]+)['"]\s*\)"""),
    re.compile(r"^\s*from\s+([A-Za-z0-9_.]+)\s+import", re.M),
    re.compile(r"^\s*import\s+([A-Za-z0-9_.]+)", re.M),
    re.compile(r"""use\s+([A-Za-z0-9_:]+)"""),
    re.compile(r"""require(?:_relative)?\s+['"]([^'"]+)['"]"""),
]


def run_git(args: list[str], repo: Path, warnings: list[str]) -> str | None:
    try:
        r = subprocess.run(
            ["git", *args], cwd=repo, text=True, timeout=GIT_TIMEOUT,
            capture_output=True, encoding="utf-8", errors="replace",
        )
    except (OSError, subprocess.SubprocessError) as exc:
        warnings.append(f"git {args[0]} failed: {exc}")
        return None
    return r.stdout if r.returncode == 0 else None


def list_files(repo: Path, warnings: list[str]) -> list[str]:
    out = run_git(["ls-files", "--cached", "--other", "--exclude-standard"], repo, warnings)
    files = [ln for ln in (out or "").splitlines() if ln.strip()]
    if files:
        return sorted(files)
    warnings.append("git unavailable or empty index; walked the filesystem (ignore rules approximated)")
    found = []
    for root, dirs, names in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
        found += [Path(root, n).relative_to(repo).as_posix() for n in names]
    return sorted(found)


def read(path: Path) -> str:
    """Read a regular file up to MAX_READ_BYTES; skip devices, pipes, and oversize files."""
    try:
        if not stat.S_ISREG(path.stat().st_mode):
            return ""
        with path.open("rb") as fh:
            data = fh.read(MAX_READ_BYTES + 1)
    except OSError:
        return ""
    return "" if len(data) > MAX_READ_BYTES else data.decode("utf-8", errors="replace")


def detect_frameworks(repo: Path, files: list[str]) -> list[str]:
    blob = " ".join(Path(f).name.lower() for f in files)
    for rel in [f for f in files if Path(f).name in MANIFESTS][:10]:
        blob += "\n" + read(repo / rel).lower()
    found = {fw for fw in FRAMEWORKS if re.search(rf"\b{fw}\b", blob)}
    if any(f.endswith("_test.go") for f in files):
        found.add("go test")
    if any(f.endswith(".rs") and "#[test]" in read(repo / f) for f in files):
        found.add("cargo test")
    return sorted(found)


def infer_conventions(test_files: list[str]) -> list[str]:
    counts: Counter[str] = Counter()
    for rel in test_files:
        name = Path(rel).name
        if re.match(r"test_.*\.py$", name):
            counts["test_*.py"] += 1
        elif name.endswith("_test.go"):
            counts["*_test.go"] += 1
        elif re.search(r"\.(test|spec)\.[jt]sx?$", name):
            counts["*.test|spec.[jt]s(x)"] += 1
        elif name.endswith("_spec.rb"):
            counts["*_spec.rb"] += 1
        if "__tests__/" in rel:
            counts["__tests__/"] += 1
        elif re.match(r"tests?/", rel):
            counts["tests/"] += 1
        elif rel.startswith("spec/"):
            counts["spec/"] += 1
    return [f"{p} ({n})" for p, n in counts.most_common()]


def strip_test_marker(stem: str) -> str:
    return re.sub(r"^test_|[._-]?(test|spec)s?$", "", stem, flags=re.IGNORECASE).lower()


def build(repo: Path, files: list[str], warnings: list[str]) -> dict:
    test_files = [f for f in files if is_test_path(f) and Path(f).suffix in SOURCE_EXTS]
    test_set = set(test_files)
    sources = [
        f for f in files
        if Path(f).suffix in SOURCE_EXTS and f not in test_set and not NON_LOGIC.search(f)
    ]
    named_tests = [t for t in test_files if TEST_NAME.search(Path(t).stem)]
    # Named-test paths with the marker removed, for mirrored-layout matching. Helpers
    # under tests/ are left out so they cannot cover a same-named source file.
    mirrored = [
        Path(t).with_name(strip_test_marker(Path(t).stem)).as_posix().lower()
        for t in named_tests
    ]

    imported: set[str] = set()
    mentioned: set[str] = set()
    weak = []
    for rel in test_files:
        text = read(repo / rel)
        for regex in IMPORT_RES:
            for ref in (m.strip() for m in regex.findall(text)):
                imported.update({ref.lower(), Path(ref).name.lower(), Path(ref).stem.lower()})
                mentioned.update(
                    p.lower() for p in re.split(r"[./:\\]", ref)
                    if p and p not in ("src", "lib", "app")
                )
        cases, assertions = len(TEST_CASE.findall(text)), len(ASSERTION.findall(text))
        # Cases with almost no assertions usually prove nothing.
        if cases and assertions <= max(1, cases // 4):
            weak.append({"path": rel, "test_cases": cases, "assertions": assertions})

    matched: dict[str, str] = {}
    unmatched = []
    for rel in sources:
        stem = Path(rel).stem.lower()
        no_ext = Path(rel).with_suffix("").as_posix().lower()
        tail = no_ext.split("/", 1)[1] if "/" in no_ext else no_ext
        tokens = {stem, rel.lower(), no_ext}
        if stem in ("index", "__init__", "mod"):
            tokens.add(Path(rel).parent.name.lower())

        how = None
        if any(strip_test_marker(Path(t).stem) == stem for t in named_tests):
            how = "name match"
        elif any(m == tail or m.endswith("/" + tail) for m in mirrored):
            how = "mirrored path"
        elif tokens & imported:
            how = "imported by a test"
        elif len(stem) > 3 and stem in mentioned:
            how = "mentioned in a test (weak)"

        if how:
            matched[rel] = how
        else:
            unmatched.append({
                "path": rel,
                "lines": read(repo / rel).count("\n") + 1,
                "dir": Path(rel).parent.as_posix(),
                "risk_keywords": [k for k in RISK_KEYWORDS if k in rel.lower()],
            })

    unmatched.sort(key=lambda u: (not u["risk_keywords"], -u["lines"]))
    weak.sort(key=lambda w: -w["test_cases"])
    by_dir: dict[str, dict] = defaultdict(lambda: {"files": 0, "lines": 0})
    for u in unmatched:
        by_dir[u["dir"]]["files"] += 1
        by_dir[u["dir"]]["lines"] += u["lines"]

    return {
        "repo": str(repo),
        "frameworks": detect_frameworks(repo, files),
        "conventions": infer_conventions(test_files),
        "totals": {
            "source_files": len(sources), "test_files": len(test_files),
            "matched": len(matched), "unmatched": len(unmatched),
        },
        "unmatched": unmatched,
        "unmatched_by_directory": sorted(
            ({"dir": d, **v} for d, v in by_dir.items()), key=lambda r: -r["files"]
        ),
        "weak_tests": weak,
        "warnings": warnings,
    }


def render(d: dict, top: int) -> str:
    t = d["totals"]
    out = [
        "# Test map", "", f"Repo: {d['repo']}",
        f"Source files: {t['source_files']}  Test files: {t['test_files']}  "
        f"Matched: {t['matched']}  Unmatched: {t['unmatched']}",
        f"Frameworks detected: {', '.join(d['frameworks']) or 'none'}",
        f"Naming conventions: {', '.join(d['conventions']) or 'none inferred'}", "",
    ]

    def section(title: str, rows: list[str], empty: str) -> None:
        out.append(f"## {title}")
        out.extend(rows[:top] or [empty])
        if len(rows) > top:
            out.append(f"  TRUNCATED: top {top} of {len(rows)}")
        out.append("")

    section(
        "Unmatched source files (risk-flagged first, then largest)",
        [
            f"- {u['path']}: {u['lines']} lines"
            + (f"  [risk: {', '.join(u['risk_keywords'])}]" if u["risk_keywords"] else "")
            for u in d["unmatched"]
        ],
        "- none",
    )
    section(
        "Unmatched by directory",
        [f"- {r['dir']}: {r['files']} files, {r['lines']} lines" for r in d["unmatched_by_directory"]],
        "- none",
    )
    section(
        "Test files with cases but few assertions",
        [f"- {w['path']}: {w['test_cases']} cases, {w['assertions']} assertions" for w in d["weak_tests"]],
        "- none flagged",
    )
    if d["warnings"]:
        section("Warnings", [f"- {w}" for w in d["warnings"]], "")
    out.append("Heuristic matcher: an unmatched file is a lead, not a finding. Grep for the module")
    out.append("name before reporting a gap as confirmed.")
    return "\n".join(out)


def positive_int(value: str) -> int:
    n = int(value)
    if n < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return n


def truncate_for_json(d: dict, top: int) -> dict:
    out = dict(d)
    truncated = {}
    for key in ("unmatched", "unmatched_by_directory", "weak_tests"):
        if len(d[key]) > top:
            truncated[key] = len(d[key])
        out[key] = d[key][:top]
    out["truncated"] = truncated  # list name -> full length, only for lists that were cut
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Map source files against tests. Read-only.")
    ap.add_argument("--repo", default=".", help="Path inside the repository.")
    ap.add_argument("--format", choices=["text", "json"], default="text")
    ap.add_argument("--top", type=positive_int, default=25, help="Rows per list (at least 1).")
    ap.add_argument("--no-git-root", action="store_true",
                    help="Use --repo literally instead of its git root, to scope to a subdirectory.")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    if not repo.is_dir():
        print(f"error: not a directory: {repo}", file=sys.stderr)
        return 2
    warnings: list[str] = []
    if not args.no_git_root:
        root = run_git(["rev-parse", "--show-toplevel"], repo, warnings)
        if root and root.strip():
            repo = Path(root.strip()).resolve()

    files = list_files(repo, warnings)
    if not files:
        print(f"error: no files found under {repo}", file=sys.stderr)
        return 2
    data = build(repo, files, warnings)
    print(json.dumps(truncate_for_json(data, args.top), indent=2) if args.format == "json" else render(data, args.top))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
