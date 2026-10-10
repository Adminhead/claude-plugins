#!/usr/bin/env python3
"""Docs-sync nudge for Claude Code hooks (stdlib only).

  docs-sync-nudge.py start   SessionStart: record HEAD for this session.
  docs-sync-nudge.py stop    Stop: once per change set, block the stop and list
                             docs that mention the changed non-doc files.

Fails open: any error, a non-git directory, or missing state prints nothing and
exits 0 so a broken nudge never traps a session.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

DOC_EXTS = (".md", ".mdx", ".rst", ".adoc", ".txt")
DOC_GLOBS = ["*.md", "*.mdx", "*.rst", "*.adoc"]
MAX_DOCS = 10
MAX_PATTERNS = 50
MIN_NAME = 4  # shorter basenames match too much prose


def git(cwd, *args):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=20)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout


def state_dir():
    d = os.environ.get("CLAUDE_PLUGIN_DATA")
    if not d:
        raise RuntimeError("CLAUDE_PLUGIN_DATA is unset")
    p = Path(d) / "docs-sync"
    p.mkdir(parents=True, exist_ok=True)
    return p


def safe_id(session_id):
    return re.sub(r"[^A-Za-z0-9_-]", "_", session_id)


def start(data):
    head_file = state_dir() / f"{safe_id(data['session_id'])}.head"
    if not head_file.exists():  # resume and compact keep the original baseline
        head_file.write_text(git(data["cwd"], "rev-parse", "HEAD").strip())


def changed_paths(cwd, base):
    out = set(git(cwd, "diff", "--name-only", "HEAD").splitlines())
    out |= set(git(cwd, "ls-files", "--others", "--exclude-standard").splitlines())
    if base:
        out |= set(git(cwd, "diff", "--name-only", base, "HEAD").splitlines())
    return sorted(p for p in out if p)


def stop(data):
    if data.get("stop_hook_active"):
        return
    cwd = data["cwd"]
    sid = safe_id(data["session_id"])
    sdir = state_dir()
    head_file = sdir / f"{sid}.head"
    base = head_file.read_text().strip() if head_file.exists() else None

    paths = changed_paths(cwd, base)
    code = [p for p in paths if not p.lower().endswith(DOC_EXTS)]
    if not code:
        return
    digest = hashlib.sha256("\n".join(code).encode()).hexdigest()
    seen_file = sdir / f"{sid}.seen"
    if seen_file.exists() and seen_file.read_text().strip() == digest:
        return

    names = {p for p in code} | {os.path.basename(p) for p in code}
    patterns = sorted(n for n in names if len(n) >= MIN_NAME)[:MAX_PATTERNS]
    if not patterns:
        return
    args = ["grep", "-l", "-F"]
    for n in patterns:
        args += ["-e", n]
    args += ["--", *DOC_GLOBS]
    try:
        hits = git(cwd, *args).splitlines()
    except RuntimeError:  # git grep exits 1 when nothing matches
        return
    docs = [d for d in hits if d not in paths][:MAX_DOCS]
    if not docs:
        return

    seen_file.write_text(digest)
    reason = (
        "Code changed that these docs mention: "
        + ", ".join(docs)
        + ". Check them for stale statements, or offer authoring:docs-audit."
    )
    print(json.dumps({"decision": "block", "reason": reason}))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    data = json.load(sys.stdin)
    {"start": start, "stop": stop}[mode](data)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # fail open
        print(f"docs-sync-nudge: {e}", file=sys.stderr)
    sys.exit(0)
