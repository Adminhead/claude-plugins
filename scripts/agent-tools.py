#!/usr/bin/env python3
"""Check that each agent's `## Tools` section agrees with its frontmatter.

Usage: agent-tools.py [AGENTS_DIR]   (default: agents/ next to this script's repo root)

Prints one `<file>: <rule>: <detail>` line per violation and exits 1, or
`agent-tools: ok (<n> agents)` and exits 0. Rules are in docs/plans/system-prompt.md (S8).
"""
import re
import sys
from pathlib import Path

CORE = ["Read", "Bash", "Edit", "Write", "NotebookEdit", "Glob", "Grep", "Agent", "Skill", "Monitor"]
BUILTIN = {
    "Read", "Grep", "Glob", "LSP", "Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch",
    "Skill", "ToolSearch", "Monitor", "SendMessage", "Artifact", "EnterWorktree", "ExitWorktree",
    "TaskStop", "Agent", "Workflow",
}
MCP_PREFIXES = (
    "mcp__plugin_code-search_codegraph__",
    "mcp__plugin_code-search_context7__",
    "mcp__plugin_code-search_grep-app__",
    "mcp__plugin_efficient-core_exa__",
    "mcp__coremods__",
    "mcp__playwright__",
)
WRITERS = {"Edit", "Write", "NotebookEdit"}
READONLY_BANNED = ["Skill", "SendMessage", "Monitor", "Artifact", "EnterWorktree"]
WRITE_VERBS = (
    "write", "edit", "create", "delete", "update", "merge", "push", "commit", "upload", "move",
    "save", "add", "comment", "assign", "fork", "request", "run", "send", "close", "remove", "set", "post",
)
MAIN_THREAD = "orchestration.md"  # runs as the session itself, so it is exempt from rules 1-4
INHERIT_HAS = "Has: all session tools except Lacks."


def split_frontmatter(text):
    m = re.match(r"---\n(.*?)\n---[ \t]*(?:\n(.*)|\Z)", text, re.S)
    return (m.group(1), m.group(2) or "") if m else (None, text)


def has_write_verb(name):
    """True when a word of the tool part (after the last `__`) is a write verb."""
    words = re.split(r"[_-]|(?<=[a-z])(?=[A-Z])", name.rsplit("__", 1)[-1])
    return any(w.lower() in WRITE_VERBS for w in words)


def csv(value):
    return [t.strip() for t in value.split(",") if t.strip()]


def parse_frontmatter(fm):
    """Return (top-level scalar keys, inline server names, hooks text, errors)."""
    keys, servers, errors = {}, [], []
    lines = fm.split("\n")
    for i, line in enumerate(lines):
        m = re.match(r"([A-Za-z]+):\s*(.*)$", line)
        if m:
            keys[m.group(1)] = m.group(2).strip()
    for k in ("tools", "disallowedTools"):
        if k in keys and keys[k] == "":
            errors.append(f"frontmatter: `{k}` must be a one-line comma-separated string, not list form")
    if "mcpServers" in keys:
        block = re.search(r"^mcpServers:\s*\n((?:[ \t]+.*\n?|\n)*)", fm + "\n", re.M)
        rows = [r for r in (block.group(1) if block else "").split("\n") if r.strip()]
        top = min((len(r) - len(r.lstrip()) for r in rows), default=0)
        for item in (m.group(1) for r in rows if (m := re.match(rf"[ \t]{{{top}}}-[ \t]+(.*)$", r))):
            m = re.match(r"([\w.-]+):\s*$", item)
            if m:
                servers.append(m.group(1))
            else:
                errors.append(f"frontmatter: mcpServers entry `{item}` is a reference; only inline servers are supported")
    hooks = re.search(r"^hooks:\s*\n((?:[ \t]+.*\n?|\n)*)", fm + "\n", re.M)
    return keys, servers, hooks.group(1) if hooks else "", errors


def has_readonly_hook(hooks):
    m = re.search(r"^[ \t]+PreToolUse:\s*\n((?:[ \t]{3,}.*\n?)*)", hooks, re.M)
    if not m:
        return False
    for entry in re.split(r"^[ \t]*-[ \t]+matcher:", m.group(1), flags=re.M)[1:]:
        if re.match(r"\s*[\"']?Bash[\"']?\s*\n", entry) and "readonly-bash.py" in entry:
            return True
    return False


def tools_section(body):
    m = re.search(r"^## Tools\s*\n(.*?)(?=^## |\Z)", body, re.S | re.M)
    if not m:
        return None, None, False
    sec = m.group(1)
    has = re.search(r"^Has:(.*)$", sec, re.M)
    lacks = re.search(r"^Lacks:(.*)$", sec, re.M)
    inherit = any(line.strip() == INHERIT_HAS for line in sec.split("\n"))
    names = lambda mm: re.findall(r"`([^`]+)`", mm.group(1)) if mm else None
    return names(has), names(lacks), inherit


def check(path):
    out = []
    v = lambda rule, detail: out.append(f"{path.name}: {rule}: {detail}")
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        return [f"{path.name}: parse: unreadable ({type(e).__name__})"]
    fm, body = split_frontmatter(text.replace("\r\n", "\n"))
    if fm is None:
        return [f"{path.name}: parse: no frontmatter"]
    keys, servers, hooks, errors = parse_frontmatter(fm)
    for e in errors:
        v("parse", e)
    if errors:
        return out
    if path.name == MAIN_THREAD:
        # A `tools` key would narrow the whole session, not just this agent.
        if "tools" in keys:
            v("5", "main-thread agent must not set tools")
        return out
    has, lacks, inherit = tools_section(body)
    if lacks is None or (has is None and not inherit):
        v("parse", "## Tools section needs a `Has:` line (or `Has: all session tools except Lacks.`) and a `Lacks:` line")
        return out

    allow = "tools" in keys
    tools = csv(keys.get("tools", ""))
    disallowed = csv(keys.get("disallowedTools", ""))
    if allow and inherit:
        v("1", "frontmatter has `tools` but the body says it inherits all session tools")
    if not allow and not inherit:
        v("1", "frontmatter has no `tools` but the body lists a `Has:` line instead of the inherit statement")
    has = has or []

    # Rule 3: names
    for where, names in (("tools", tools), ("disallowedTools", disallowed), ("Has", has), ("Lacks", lacks)):
        for n in names:
            if n.startswith("mcp__"):
                ok = n.startswith(MCP_PREFIXES)
            else:
                ok = n in BUILTIN
            if not ok:
                v("3", f"unknown tool name `{n}` in {where}")

    # Rule 1: Has/Lacks vs frontmatter
    if allow and not inherit:
        want = [t for t in tools + [f"mcp__{s}__*" for s in servers] if t not in disallowed]
        if set(has) != set(want):
            v("1", f"Has is {sorted(has)}, frontmatter gives {sorted(want)}")
        both = sorted(set(has) & set(lacks))
        if both:
            v("1", f"Has and Lacks overlap: {both}")
    missing = [d for d in disallowed if d not in lacks]
    if missing:
        v("1", f"Lacks is missing disallowedTools entries: {missing}")

    # Rule 2: core tools in exactly one line
    def in_has(t):
        return t not in lacks if inherit else t in has

    if not inherit:  # for inheriting agents membership is implied by Lacks
        for t in CORE:
            if (t in has) == (t in lacks):
                v("2", f"core tool `{t}` must appear in exactly one of Has or Lacks")

    # Rule 4: read-only agents
    if not any(in_has(t) for t in WRITERS):
        if "memory" in keys:
            v("4", "read-only agent has a `memory` key")
        if inherit:  # an inheriting agent gets every session MCP tool
            v("4", "read-only agents must use an allowlist")
            return out
        for t in READONLY_BANNED:
            if in_has(t):
                v("4", f"read-only agent has `{t}`")
        for n in has:
            if n.startswith("mcp__") and has_write_verb(n):
                v("4", f"read-only agent has MCP tool `{n}` with a write verb")
        bash, hook = in_has("Bash"), has_readonly_hook(hooks)
        if bash != hook:
            v("4", "read-only agent has Bash without a PreToolUse Bash readonly-bash.py hook" if bash
              else "read-only agent has the readonly-bash.py hook but no Bash")
    return out


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "agents"
    files = sorted(root.glob("*.md"))
    if not files:
        print(f"agent-tools: no agents in {root}", file=sys.stderr)
        return 1
    problems = [p for f in files for p in check(f)]
    if problems:
        print("\n".join(problems))
        return 1
    print(f"agent-tools: ok ({len(files)} agents)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
