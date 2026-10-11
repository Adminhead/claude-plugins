#!/usr/bin/env python3
"""Docs-sync nudge for Claude Code hooks (stdlib only).

  docs-sync-nudge.py start   SessionStart: record HEAD for this session.
  docs-sync-nudge.py stop    Stop: once per change set, nudge Claude (non-error
                             additionalContext) with docs that mention the
                             changed non-doc files.

Fails open: any error, a non-git directory, or missing state prints nothing and
exits 0 so a broken nudge never traps a session.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

DOC_EXTS = (".md", ".mdx", ".rst", ".adoc", ".txt")
DOC_GLOBS = ["*.md", "*.mdx", "*.rst", "*.adoc"]
MAX_DOCS = 10
MAX_PATTERNS = 50
PRUNE_DAYS = 30
MIN_NAME = 4  # shorter basenames match too much prose


def git(cwd, *args):
    r = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, timeout=20)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout


def nul_list(text):
    return [p for p in text.split("\0") if p]


def toplevel(cwd):
    """Repo root, or None outside a git repo or before the first commit."""
    r = subprocess.run(
        ["git", "-C", cwd, "rev-parse", "--show-toplevel", "--verify", "-q", "HEAD"],
        capture_output=True, text=True, timeout=20,
    )
    return r.stdout.splitlines()[0] if r.returncode == 0 else None


def state_dir():
    d = os.environ.get("CLAUDE_PLUGIN_DATA")
    if not d:
        return None
    p = Path(d) / "docs-sync"
    p.mkdir(parents=True, exist_ok=True)
    return p


def safe_id(session_id):
    return re.sub(r"[^A-Za-z0-9_-]", "_", session_id)


def prune(sdir):
    cutoff = time.time() - PRUNE_DAYS * 86400
    for f in sdir.iterdir():
        if f.is_file() and f.stat().st_mtime < cutoff:
            f.unlink()


def start(data):
    sdir = state_dir()
    top = toplevel(data["cwd"])
    if not sdir or not top:
        return
    prune(sdir)
    head_file = sdir / f"{safe_id(data['session_id'])}.head"
    if not head_file.exists():  # resume and compact keep the original baseline
        head_file.write_text(git(top, "rev-parse", "HEAD").strip())


def changed_paths(top, base):
    out = set(nul_list(git(top, "diff", "--name-only", "-z", "HEAD")))
    out |= set(nul_list(git(top, "ls-files", "-z", "--others", "--exclude-standard")))
    if base:
        out |= set(nul_list(git(top, "diff", "--name-only", "-z", base, "HEAD")))
    return sorted(out)


def stop(data):
    if data.get("stop_hook_active"):
        return
    sdir = state_dir()
    top = toplevel(data["cwd"])
    if not sdir or not top:
        return
    sid = safe_id(data["session_id"])
    head_file = sdir / f"{sid}.head"
    base = head_file.read_text().strip() if head_file.exists() else None

    paths = changed_paths(top, base)
    code = [p for p in paths if not p.lower().endswith(DOC_EXTS)]
    if not code:
        return
    digest = hashlib.sha256("\n".join(code).encode()).hexdigest()
    seen_file = sdir / f"{sid}.seen"
    if seen_file.exists() and seen_file.read_text().strip() == digest:
        return

    # Full paths first, so the cap drops generic basenames before specific paths.
    names = [n for n in code + sorted({os.path.basename(p) for p in code}) if len(n) >= MIN_NAME]
    patterns = list(dict.fromkeys(names))[:MAX_PATTERNS]
    if not patterns:
        return
    args = ["grep", "-l", "-z", "-F"]
    for n in patterns:
        args += ["-e", n]
    args += ["--", *DOC_GLOBS]
    try:
        hits = nul_list(git(top, *args))
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
    # additionalContext is non-error feedback; decision: block would show as a "blocking error".
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "Stop", "additionalContext": reason}}))


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
