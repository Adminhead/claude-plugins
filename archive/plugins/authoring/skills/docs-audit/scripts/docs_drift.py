#!/usr/bin/env python3
"""Check machine-verifiable documentation claims against a repository.

Read-only and standard library only. Reports claims that have a definite answer:

  command  a `npm|pnpm|yarn|bun run X` or `make X` in a fenced block or inline code
           that does not exist (plain prose is ignored)
  link     a relative Markdown link whose target is missing
  env      a variable named in docs or in an `.env*.example`/`.sample`/`.template` file
           that code never reads, or a variable code reads that nothing documents.
           The documented-but-unread direction only covers names ending in _URL, _KEY,
           _TOKEN, _HOST, _PORT, or _SECRET, to keep prose constants out
  stale    a doc with a `Fingerprint: git:<sha>` and `Monitored: <paths>` header whose
           monitored paths changed after that commit, or whose commit cannot be resolved

It never judges prose. Environment file values are never read, only names.
Exit status is 0 with no findings, 1 with findings, 2 on a usage error.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", "vendor", "venv", ".venv", "dist", "build", "target",
             "__pycache__", ".next", "coverage", ".terraform", "site-packages"}
DOC_EXTS = {".md", ".mdx", ".rst"}
CODE_EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rs", ".rb", ".sh", ".java"}
MAX_BYTES = 1_000_000
MAX_LISTED_PATHS = 10
ENV_TEMPLATE = re.compile(r"^\.?env(\..+)?\.(example|sample|template)$|^\.env\.(example|sample|template)$")
ENV_LINE = re.compile(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=", re.M)

RUN_CMD = re.compile(r"\b(?:npm|pnpm|yarn|bun)\s+run\s+([\w:.-]+)")
MAKE_CMD = re.compile(r"\bmake\s+([A-Za-z][\w.-]*)")
LINK = re.compile(r"!?\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)")
ENV_READ = [
    re.compile(r"process\.env\.([A-Z][A-Z0-9_]*)"),
    re.compile(r"""os\.environ(?:\.get)?[\[(]\s*['"]([A-Z][A-Z0-9_]*)"""),
    re.compile(r"""os\.getenv\(\s*['"]([A-Z][A-Z0-9_]*)"""),
    re.compile(r"""(?:Getenv|env::var)\(\s*"([A-Z][A-Z0-9_]*)"\)"""),
    re.compile(r"\$\{?([A-Z][A-Z0-9_]{3,})\}?"),
]
ENV_DOC = re.compile(r"`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`")
FINGERPRINT = re.compile(r"^>?\s*Fingerprint:\s*git:([0-9a-f]{7,40})", re.M)
MONITORED = re.compile(r"^>?\s*Monitored:\s*(.+)$", re.M)


def git(repo, *args):
    try:
        done = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return done.stdout if done.returncode == 0 else None


def files(repo):
    for path in sorted(repo.rglob("*")):
        rel = path.relative_to(repo)
        if path.is_file() and not SKIP_DIRS.intersection(rel.parts) and path.stat().st_size <= MAX_BYTES:
            yield path


def read(path):
    return path.read_text(encoding="utf-8", errors="replace")


def prose_lines(text):
    """Yield (line number, line, inside_fence) for every line except the fence markers."""
    fenced = False
    for number, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        yield number, line, fenced


def known_commands(repo):
    scripts, targets = set(), set()
    pkg = repo / "package.json"
    if pkg.is_file():
        try:
            scripts = set(json.loads(read(pkg)).get("scripts", {}))
        except json.JSONDecodeError:
            pass
    for name in ("Makefile", "makefile", "GNUmakefile"):
        if (repo / name).is_file():
            targets |= set(re.findall(r"^([A-Za-z][\w.-]*)\s*:(?!=)", read(repo / name), re.M))
    return scripts, targets


def check(repo):
    findings = []
    scripts, targets = known_commands(repo)
    docs = [p for p in files(repo) if p.suffix in DOC_EXTS]
    code = [p for p in files(repo) if p.suffix in CODE_EXTS]
    read_names = {name: p for p in code for pat in ENV_READ for name in pat.findall(read(p))}
    documented = {}

    for doc in docs:
        rel = str(doc.relative_to(repo))
        text = read(doc)
        for number, line, fenced in prose_lines(text):
            searchable = line if fenced else " ".join(re.findall(r"`([^`]+)`", line))
            for name in RUN_CMD.findall(searchable):
                if (repo / "package.json").is_file() and name not in scripts:
                    findings.append((rel, number, "command", f"no package.json script named '{name}'"))
            for name in MAKE_CMD.findall(searchable):
                if targets and name not in targets:
                    findings.append((rel, number, "command", f"no make target named '{name}'"))
            if not fenced:
                for target in LINK.findall(line):
                    if "://" in target or target.startswith(("mailto:", "/")):
                        continue
                    if not (doc.parent / target).exists():
                        findings.append((rel, number, "link", f"missing target '{target}'"))
                for name in ENV_DOC.findall(line):
                    documented.setdefault(name, (rel, number))
        fingerprint, monitored = FINGERPRINT.search(text), MONITORED.search(text)
        if fingerprint and monitored:
            paths = [p.strip().strip("`") for p in monitored.group(1).split(",") if p.strip()]
            changed = git(repo, "diff", "--name-only", fingerprint.group(1), "HEAD", "--", *paths)
            if changed is None:
                findings.append((rel, 0, "stale", "fingerprint commit not found or not a git repo"))
            elif changed.strip():
                names = changed.split()
                listed = ", ".join(names[:MAX_LISTED_PATHS])
                more = f" and {len(names) - MAX_LISTED_PATHS} more" if len(names) > MAX_LISTED_PATHS else ""
                findings.append((rel, 0, "stale", f"monitored paths changed since fingerprint: {listed}{more}"))

    # Only variable-shaped names are checked as documented-but-unread, to keep prose constants out.
    for path in files(repo):
        if ENV_TEMPLATE.match(path.name):
            for name in ENV_LINE.findall(read(path)):
                documented.setdefault(name, (str(path.relative_to(repo)), 0))
    for name, (rel, number) in sorted(documented.items()):
        if name not in read_names and (name.endswith(("_URL", "_KEY", "_TOKEN", "_HOST", "_PORT", "_SECRET"))):
            findings.append((rel, number, "env", f"{name} is documented but no code reads it"))
    undocumented = sorted(n for n in read_names if n not in documented and "_" in n and not n.startswith("_"))
    for name in undocumented:
        findings.append((str(read_names[name].relative_to(repo)), 0, "env", f"{name} is read but not documented"))
    return findings


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("repo", nargs="?", default=".", help="repository root (default: current directory)")
    parser.add_argument("--json", action="store_true", help="print findings as JSON")
    parser.add_argument("--top", type=int, default=50, help="maximum findings to print (default 50)")
    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    if not repo.is_dir():
        print(f"error: not a directory: {args.repo}", file=sys.stderr)
        return 2
    findings = check(repo)
    shown = findings[: args.top]
    if args.json:
        print(json.dumps([dict(zip(("file", "line", "kind", "message"), f)) for f in shown], indent=2))
    else:
        for file, line, kind, message in shown:
            print(f"{file}:{line}: [{kind}] {message}" if line else f"{file}: [{kind}] {message}")
        if len(findings) > len(shown):
            print(f"... {len(findings) - len(shown)} more (raise --top)")
        print(f"{len(findings)} finding(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
