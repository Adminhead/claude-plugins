#!/usr/bin/env python3
"""List and digest Claude Code session transcripts so a dead session can be recovered.

  necromancy.py list   [--project PATH] [--max 10] [--exclude ID]
  necromancy.py digest --session ID|PREFIX|latest [--project PATH] [--exclude ID] [--out PATH]

`list` prints one line per session, newest first. `digest` writes a masked Markdown digest (at most 32 KB) to a
0600 file and prints only a receipt: the path, the size, the time span and a count per section. The transcript
format is internal to Claude Code and undocumented; every field read here has a fallback or is skipped.
Python 3 standard library only.
"""
import argparse
import json
import os
import re
import sys
import tempfile
import time
from collections import Counter

MAX_LINE = 8 * 1024 * 1024  # a longer transcript line is skipped unread
MAX_DIGEST = 32 * 1024  # bytes
LIVE_SECONDS = 120  # a transcript written this recently probably belongs to a running session
WORKTREE_INFIX = "--claude-worktrees-"

# Secret shapes masked before anything is emitted. Python port of SECRETS in scripts/shared/log/usagelog.ts.
SECRETS = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|\Z)"), "<private-key>"),
    (re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}"), "<github-token>"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"), "<github-token>"),
    (re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}"), "<api-key>"),
    (re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"), "<aws-key>"),
    (re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}"), "<slack-token>"),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{35}"), "<google-key>"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), "<jwt>"),
    (re.compile(r"\b(Bearer|Basic|token)(\s+)[A-Za-z0-9._~+/=-]{12,}", re.I), r"\1\2<token>"),
    (
        re.compile(
            r"\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIALS?)"
            r"[A-Za-z0-9_]*)(\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|[^\s\"';&|]+)",
            re.I,
        ),
        r"\1\2<redacted>",
    ),
    (re.compile(r"(://[^/\s:@]+:)[^@\s/]+@"), r"\1<redacted>@"),
]

# ASCII-only \b, as in the JS source: a CJK or accented letter before a token must not hide it.
SECRETS = [(re.compile(rx.pattern, (rx.flags & ~re.UNICODE) | re.ASCII), to) for rx, to in SECRETS]

BARE_COMMANDS = ("/clear", "/compact")
COMMIT_RE = re.compile(r"\[([\w./-]+)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)")
HANDOFF_PATH_RE = re.compile(r"\S*handoff-\S*\.md")
CMD_NAME_RE = re.compile(r"<command-name>\s*(.*?)\s*</command-name>", re.S)
CMD_ARGS_RE = re.compile(r"<command-args>(.*?)(?:</command-args>|$)", re.S)


def redact(text):
    for rx, to in SECRETS:
        text = rx.sub(to, text)
    return text


def clip(text, n, flat=True):
    """Redact, optionally collapse whitespace, then cut to n characters."""
    text = redact(str(text))
    if flat:
        text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def clip_tail(text, n):
    text = " ".join(redact(str(text)).split())
    return text if len(text) <= n else "…" + text[-(n - 1):]


def config_dir():
    return os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")


def slug(path):
    return re.sub(r"[^A-Za-z0-9]", "-", path)


def project_dirs(project):
    """Store directories for a project: the slug (also case-insensitively) plus its worktree slugs."""
    root = os.path.join(config_dir(), "projects")
    want = slug(os.path.abspath(project)).lower()
    try:
        names = sorted(os.listdir(root))
    except OSError:
        return []
    out = []
    for name in names:
        low = name.lower()
        if low == want or low.startswith(want + WORKTREE_INFIX):
            full = os.path.join(root, name)
            if os.path.isdir(full):
                out.append(full)
    return out


def session_files(project):
    files = []
    for d in project_dirs(project):
        for name in os.listdir(d):
            if name.endswith(".jsonl"):
                p = os.path.join(d, name)
                try:
                    files.append((os.stat(p).st_mtime, name[: -len(".jsonl")], p))
                except OSError:
                    pass
    files.sort(reverse=True)
    return files


def read_records(path):
    """Yield parsed JSON objects, skipping unparsable lines and lines over MAX_LINE."""
    with open(path, "rb") as f:
        while True:
            raw = f.readline(MAX_LINE + 1)
            if not raw:
                return
            if len(raw) > MAX_LINE and not raw.endswith(b"\n"):
                while True:
                    chunk = f.readline(1 << 20)
                    if not chunk or chunk.endswith(b"\n"):
                        break
                continue
            try:
                rec = json.loads(raw)
            except ValueError:
                continue
            if isinstance(rec, dict):
                yield rec


def blocks(content):
    return [b for b in content if isinstance(b, dict)] if isinstance(content, list) else []


def result_text(content):
    if isinstance(content, str):
        return content
    return "\n".join(b.get("text", "") for b in blocks(content) if b.get("type") == "text")


def user_text(content):
    if isinstance(content, str):
        return content
    return "\n".join(b.get("text", "") for b in blocks(content) if b.get("type") == "text")


def render_prompt(text):
    """The human prompt as typed, or None when it is system text."""
    text = text.strip()
    if not text:
        return None
    if text.startswith("<command-name>"):
        m = CMD_NAME_RE.search(text)
        a = CMD_ARGS_RE.search(text)
        return " ".join(x for x in (m.group(1) if m else "", a.group(1).strip() if a else "") if x)
    if text.startswith(("<task-notification>", "<local-command-", "<bash-input>", "<bash-stdout>", "<bash-stderr>")):
        return None
    return text


def is_human(rec, text):
    origin = rec.get("turnOrigin")
    if origin is not None:
        return origin == "human"
    source = rec.get("promptSource")
    if source is not None:
        return source == "typed"
    return not text.lstrip().startswith("<") or text.lstrip().startswith("<command-name>")


def brief_input(name, inp):
    if not isinstance(inp, dict):
        return name
    if name == "Bash":
        return "Bash: " + str(inp.get("command", "")).strip().split("\n", 1)[0]
    for key in ("file_path", "notebook_path", "description", "pattern", "url"):
        if inp.get(key):
            return f"{name}: {inp[key]}"
    return name


class Session:
    """Everything the digest and the list line need, collected in one pass over a transcript."""

    def __init__(self, path):
        self.path = path
        self.id = os.path.basename(path)[: -len(".jsonl")]
        self.size = os.path.getsize(path)
        self.mtime = os.path.getmtime(path)
        self.first_ts = self.last_ts = None
        self.cwds, self.branches, self.versions = [], [], []
        self.titles = {}
        self.compactions = 0
        self.last_type = None
        self.prompts = []
        self.sdk_prompts = []
        self.answers = []
        self.rejections = []
        self.summary = None
        self.tasks = {}
        self.files = Counter()
        self.git = []
        self.commands = []
        self.agents = []
        self.errors = []
        self.finals = []
        self.handoffs = []
        self.handoff_mktemp = False
        self._tool_names = {}
        self._pending = {}
        self._creates = {}
        self._mktemp_ids = set()
        self._task_seq = 0
        for rec in read_records(path):
            self._take(rec)
        if not self.prompts:  # a headless `claude -p` session has no human turns
            self.prompts = self.sdk_prompts
        self.pending = list(self._pending.values())[-1] if self._pending else None

    def _note(self, seq, value):
        if value and value not in seq:
            seq.append(value)

    def _take(self, rec):
        t = rec.get("type")
        ts = rec.get("timestamp")
        if isinstance(ts, str):
            self.first_ts = self.first_ts or ts
            self.last_ts = ts
        if t == "custom-title":
            self.titles["custom"] = rec.get("customTitle")
        elif t == "ai-title":
            self.titles["ai"] = rec.get("aiTitle")
        elif t == "agent-name":
            self.titles["agent"] = rec.get("agentName")
        elif t == "pr-link" and rec.get("prUrl"):
            self._git_add(f"pr-link: {rec.get('prRepository', '')}#{rec.get('prNumber', '')} {rec['prUrl']}")
        elif t == "system" and rec.get("subtype") == "compact_boundary":
            self.compactions += 1
        if t in ("user", "assistant", "system"):
            self.last_type = t
        if rec.get("isSidechain"):
            return
        if t in ("user", "assistant"):
            self._pending.clear()  # a later record means an earlier unanswered call was not the last thing that happened
            self._note(self.cwds, rec.get("cwd"))
            self._note(self.branches, rec.get("gitBranch"))
            self._note(self.versions, rec.get("version"))
        msg = rec.get("message")
        content = msg.get("content") if isinstance(msg, dict) else None
        if t == "assistant":
            self._assistant(content)
        elif t == "user":
            self._user(rec, content)

    def _git_add(self, line):
        if line not in self.git:
            self.git.append(line)

    def _assistant(self, content):
        text = "\n".join(b.get("text", "") for b in blocks(content) if b.get("type") == "text").strip()
        if text:
            self.finals.append(text)
            del self.finals[:-3]
        for b in blocks(content):
            if b.get("type") != "tool_use":
                continue
            name, inp, tid = b.get("name", "?"), b.get("input"), b.get("id")
            inp = inp if isinstance(inp, dict) else {}
            if tid:
                self._tool_names[tid] = (name, inp)
                self._pending[tid] = brief_input(name, inp)
            if name in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
                path = inp.get("file_path") or inp.get("notebook_path")
                if path:
                    self.files[path] += 1
                base = os.path.basename(str(path or ""))
                if name == "Write" and base.startswith("handoff-") and base.endswith(".md"):
                    self._note(self.handoffs, str(path))
            elif name == "Bash":
                cmd = str(inp.get("command", ""))
                self.commands.append(cmd.strip().split("\n", 1)[0])
                if "mktemp" in cmd and "handoff-" in cmd and tid:
                    self._mktemp_ids.add(tid)
                    self.handoff_mktemp = True
            elif name == "Agent" or name == "Task":
                kind = inp.get("subagent_type") or "agent"
                self.agents.append(f"{kind}: {inp.get('description', '')}")
            elif name == "TaskCreate" and tid:
                self._creates[tid] = str(inp.get("subject") or inp.get("description") or "")
            elif name == "TaskUpdate":
                task = self.tasks.get(str(inp.get("taskId")))
                if task is not None and inp.get("status"):
                    task["status"] = str(inp["status"])

    def _user(self, rec, content):
        res = rec.get("toolUseResult")
        res = res if isinstance(res, dict) else {}
        first_result_id = None
        for b in blocks(content):
            if b.get("type") == "tool_result":
                first_result_id = first_result_id or b.get("tool_use_id")
                self._tool_result(b, res)
        git = res.get("gitOperation")
        if isinstance(git, dict):
            c, p, pr = git.get("commit"), git.get("push"), git.get("pr")
            if isinstance(c, dict):
                self._git_add(f"commit {str(c.get('sha', ''))[:10]} on {c.get('branch', '?')} ({c.get('kind', 'commit')})")
            if isinstance(p, dict):
                self._git_add(f"push {p.get('branch', '')}")
            if isinstance(pr, dict):
                self._git_add(f"pr {pr.get('action', '')} #{pr.get('number', '')} {pr.get('url', '')}".strip())
        answers = res.get("answers")
        if isinstance(answers, dict):
            for q, a in answers.items():
                self.answers.append(f"{q} -> {a}")
        if rec.get("toolDenialKind") == "user-rejected":
            name, inp = self._tool_names.get(first_result_id, ("tool", {}))
            self.rejections.append(brief_input(name, inp))
        if rec.get("isMeta"):
            return
        text = user_text(content)
        if rec.get("isCompactSummary"):
            self.summary = text
            return
        if not text.strip() or any(b.get("type") == "tool_result" for b in blocks(content)):
            return
        if is_human(rec, text):
            shown = render_prompt(text)
            if shown and shown not in BARE_COMMANDS:
                self.prompts.append(shown)
        elif rec.get("turnOrigin") == "sdk" and isinstance(content, str):
            shown = render_prompt(text)
            if shown:
                self.sdk_prompts.append(shown)

    def _tool_result(self, b, res):
        tid = b.get("tool_use_id")
        self._pending.pop(tid, None)
        name = self._tool_names.get(tid, ("tool", {}))[0]
        text = result_text(b.get("content"))
        if b.get("is_error"):
            self.errors.append(f"{name}: {text.strip().split(chr(10), 1)[0]}")
        if tid in self._mktemp_ids:
            m = HANDOFF_PATH_RE.search(text)
            if m:
                self._note(self.handoffs, m.group(0))
        if tid in self._creates:
            tid_num = None
            task = res.get("task")
            if isinstance(task, dict) and task.get("id") is not None:
                tid_num = str(task["id"])
            elif res.get("taskId") is not None:
                tid_num = str(res["taskId"])
            else:
                m = re.search(r"[Tt]ask #?(\d+)", text)
                tid_num = m.group(1) if m else None
            self._task_seq += 1
            self.tasks[tid_num or str(self._task_seq)] = {"subject": self._creates[tid], "status": "pending"}
        if name == "Bash" and not isinstance(res.get("gitOperation"), dict):
            for m in COMMIT_RE.finditer(str(res.get("stdout") or text)):
                self._git_add(f"commit {m.group(2)[:10]} on {m.group(1)}: {m.group(3)}")

    def title(self):
        for k in ("custom", "ai", "agent"):
            if self.titles.get(k):
                return self.titles[k]
        return ""

    def first_ask(self):
        return self.prompts[0] if self.prompts else ""

    def live(self, now=None):
        return (now if now is not None else time.time()) - self.mtime < LIVE_SECONDS


def iso(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ts))


def list_line(s, now):
    handoff = ""
    if s.handoffs:
        h = s.handoffs[-1]
        handoff = f" handoff={clip(h, 120)}({'exists' if os.path.exists(h) else 'gone'})"
    elif s.handoff_mktemp:
        handoff = " handoff=mktemp(path unknown)"
    live = " live?" if s.live(now) else ""
    return (
        f"{s.id} {iso(s.mtime)} {s.size // 1024}KB{live} compactions={s.compactions}{handoff}"
        f' title="{clip(s.title(), 80)}" ask="{clip(s.first_ask(), 160)}"'
    )


def digest_text(s):
    """The digest and a count per section. Over the cap, the largest sections shrink first; the header and the final
    assistant text are kept."""
    secs = []

    def section(name, lines):
        secs.append((name, lines))

    head = [
        f"- session: {s.id}",
        f"- file: {s.path}",
        f"- size: {s.size // 1024} KB",
        f"- span: {s.first_ts} -> {s.last_ts}",
        f"- cwds: {clip(', '.join(s.cwds[:5]), 300)}",
        f"- branches: {clip(', '.join(s.branches[:5]), 200)}",
        f"- claude code versions: {', '.join(s.versions[:5])}",
        f"- titles: {clip('; '.join(f'{k}={v}' for k, v in s.titles.items() if v), 300)}",
        f"- compactions: {s.compactions}",
        f"- last record type: {s.last_type}",
    ]
    section("Header", head)
    section("Pending call (died mid-call)", [f"- {clip(s.pending, 200)}"] if s.pending else [])
    section("First request", [clip(s.first_ask(), 800)] if s.prompts else [])
    decisions = [f"- {clip(p, 300)}" for p in s.prompts[1:][-30:]]
    decisions += [f"- answer: {clip(a, 200)}" for a in s.answers[-15:]]
    decisions += [f"- rejected: {clip(r, 200)}" for r in s.rejections[-10:]]
    section("User decisions", decisions)
    summary = []
    if s.summary:
        summary = ["> " + ln for ln in redact(s.summary).strip()[:2500].splitlines()]
    section("Latest compact summary", summary)
    tasks = sorted(s.tasks.values(), key=lambda t: t["status"] in ("completed", "deleted"))
    section("Tasks", [f"- [{t['status']}] {clip(t['subject'], 200)}" for t in tasks[:30]])
    section("Files written", [f"- {clip(p, 200)} ({c}x)" for p, c in s.files.most_common(40)])
    section("Git", [f"- {clip(g, 200)}" for g in s.git[-15:]])
    section("Commands (last)", [f"- `{clip(c, 160)}`" for c in s.commands[-25:]])
    section("Subagents", [f"- {clip(a, 200)}" for a in s.agents[-20:]])
    section("Errors", [f"- {clip(e, 200)}" for e in s.errors[-15:]])
    section("Final assistant text", [f"- {clip_tail(t, 800)}" for t in s.finals])

    def render():
        out = ["# Necromancy digest\n"]
        for name, lines in secs:
            out += [f"## {name}", *(lines or ["(none)"]), ""]
        return "\n".join(out)

    def size():
        return len(render().encode("utf-8"))

    if size() > MAX_DIGEST:
        head.append("- note: sections were trimmed to fit 32 KB")
        keep = ("Header", "Final assistant text")
        while size() > MAX_DIGEST:
            trimmable = [lines for name, lines in secs if name not in keep and lines]
            if not trimmable:
                break
            max(trimmable, key=lambda ln: sum(len(x.encode("utf-8")) for x in ln)).pop()
    text = render()
    raw = text.encode("utf-8")
    if len(raw) > MAX_DIGEST:  # backstop: the kept sections alone are over the cap
        marker = "\n\n[digest truncated at 32 KB]\n".encode()
        text = raw[: MAX_DIGEST - len(marker)].decode("utf-8", "ignore") + marker.decode()
    counts = {name: (1 if lines else 0) if name == "Latest compact summary" else len(lines) for name, lines in secs}
    return text, counts


def resolve(project, ref, exclude):
    files = [f for f in session_files(project) if not (exclude and f[1].startswith(exclude))]
    if not files:
        sys.exit("necromancy: no sessions found for this project (check --project and CLAUDE_CONFIG_DIR)")
    if ref == "latest":
        return files[0][2]
    hits = [f for f in files if f[1].startswith(ref)]
    if not hits:
        sys.exit(f"necromancy: no session starts with {ref!r}; run `list` to see the ids")
    if len(hits) > 1:
        print(f"necromancy: {ref!r} matches {len(hits)} sessions; use a longer prefix:", file=sys.stderr)
        for m, sid, _ in hits:
            print(f"  {sid} {iso(m)}", file=sys.stderr)
        sys.exit(2)
    return hits[0][2]


def cmd_list(args):
    now = time.time()
    shown = 0
    for _, sid, path in session_files(args.project):
        if args.exclude and sid.startswith(args.exclude):
            continue
        print(list_line(Session(path), now))
        shown += 1
        if shown >= args.max:
            break
    if not shown:
        print("necromancy: no sessions found for this project (check --project and CLAUDE_CONFIG_DIR)", file=sys.stderr)
        return 1
    return 0


def write_private(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)  # an existing file keeps its old mode through O_CREAT
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)


def cmd_digest(args):
    s = Session(resolve(args.project, args.session, args.exclude))
    text, counts = digest_text(s)
    if args.out:
        out = args.out
        write_private(out, text)
    else:
        fd, out = tempfile.mkstemp(prefix=f"necromancy-{s.id[:8]}-", suffix=".md")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
    print(f"digest: {out}")
    print(f"bytes: {len(text.encode('utf-8'))}")
    print(f"span: {s.first_ts} -> {s.last_ts}")
    print("sections: " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("list", "digest"):
        sp = sub.add_parser(name)
        sp.add_argument("--project", default=os.getcwd(), help="project path (default: current directory)")
        sp.add_argument("--exclude", default="", help="session id or prefix to skip, such as the live session")
        if name == "list":
            sp.add_argument("--max", type=int, default=10)
        else:
            sp.add_argument("--session", required=True, help="id, unique prefix or 'latest'")
            sp.add_argument("--out", help="write the digest here instead of a temp file")
    args = p.parse_args(argv)
    return cmd_list(args) if args.cmd == "list" else cmd_digest(args)


if __name__ == "__main__":
    sys.exit(main())
