#!/usr/bin/env python3
"""Check each agent's tool frontmatter.

Usage: agent-tools.py [AGENTS_DIR]   (default: agents/ next to this script's repo root)

Rules:
  3  every name in `tools` and `disallowedTools` is a known builtin or an MCP entry on a known server:
     `mcp__<server>`, `mcp__<server>__*` or `mcp__<server>__<tool>` (MCP_SERVERS).
  4  an agent whose effective tools (`tools` plus inline-server wildcards, minus `disallowedTools`) hold
     none of Edit/Write/NotebookEdit is read-only: no `memory` key, none of READONLY_BANNED, no
     server-level grant of a server with write tools (inline servers excepted), no MCP tool with a
     write verb, and Bash iff the readonly-bash hook (the Python command, or the bun command with both
     isolation flags and `|| exit 2`). Without a `tools` allowlist an agent
     inherits every session tool, so one that disallows all three writers must use an allowlist instead.
  5  orchestration.md runs as the session itself and must not set `tools`.

Prints one `<file>: <rule>: <detail>` line per violation and exits 1, or
`agent-tools: ok (<n> agents)` and exits 0.
"""
import re
import sys
from pathlib import Path

BUILTIN = {
    "Read", "Grep", "Glob", "LSP", "Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch",
    "Skill", "ToolSearch", "Monitor", "SendMessage", "Artifact", "EnterWorktree", "ExitWorktree",
    "TaskStop", "Agent", "Workflow", "PowerShell", "TodoWrite", "SubagentHandback",
}
# Known MCP server ids (the part after `mcp__`) -> whether every tool on the server is read-only.
MCP_SERVERS = {
    "plugin_code-search_codegraph": True,
    "plugin_code-search_context7": True,
    "plugin_code-search_grep-app": True,
    "plugin_efficient-core_exa": True,
    "coremods": True,
    "playwright": False,
    "plugin_github_github": False,
    "claude-in-chrome": False,
}
WRITERS = {"Edit", "Write", "NotebookEdit"}
READONLY_BANNED = ["Skill", "SendMessage", "Monitor", "Artifact", "EnterWorktree"]
WRITE_VERBS = (
    "write", "edit", "create", "delete", "update", "merge", "push", "commit", "upload", "move",
    "save", "add", "comment", "assign", "fork", "request", "run", "send", "close", "remove", "set", "post",
)
MAIN_THREAD = "orchestration.md"  # runs as the session itself, so it is exempt from rules 3-4
DOCS = {"CLAUDE.md"}  # no frontmatter, so Claude Code treats it as documentation, not an agent


def split_frontmatter(text):
    m = re.match(r"---\n(.*?)\n---[ \t]*(?:\n(.*)|\Z)", text, re.S)
    return (m.group(1), m.group(2) or "") if m else (None, text)


def has_write_verb(name):
    """True when a word of the tool part (after the last `__`) is a write verb."""
    words = re.split(r"[_-]|(?<=[a-z])(?=[A-Z])", name.rsplit("__", 1)[-1])
    return any(w.lower() in WRITE_VERBS for w in words)


def mcp_parts(name):
    """Split `mcp__<server>[__<tool>]` into (server, tool); tool is None for a bare server."""
    server, _, tool = name[len("mcp__"):].partition("__")
    return server, tool or None


def csv(value):
    return [t.strip() for t in value.split(",") if t.strip()]


def parse_frontmatter(fm):
    """Return (top-level scalar keys, inline server names, hooks text, errors)."""
    keys, servers, errors = {}, [], []
    for line in fm.split("\n"):
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


BUN_HOOK = re.compile(
    r'bun (?:--no-env-file --config=/dev/null|--config=/dev/null --no-env-file)'
    r' "\$HOME/\.claude/hooks/readonly-bash\.ts" \|\| exit 2'
)


def bun_hook_problems(cmd):
    """Return [] for the exact bun command; otherwise name the gap, or say the form is wrong."""
    if BUN_HOOK.fullmatch(cmd):
        return []
    words = cmd.split()
    problems = []
    if words[:1] != ["bun"]:
        problems.append("must start with `bun`")
    if "--no-env-file" not in words:
        problems.append("is missing `--no-env-file`")
    if "--config=/dev/null" not in words:
        problems.append("is missing `--config=/dev/null`")
    if not cmd.endswith("|| exit 2"):
        problems.append("must end with `|| exit 2`")
    return problems or [
        'must be exactly `bun --no-env-file --config=/dev/null "$HOME/.claude/hooks/readonly-bash.ts" || exit 2`'
    ]


def readonly_hook(hooks):
    """Return None when no Bash PreToolUse entry runs readonly-bash, else the problems with its command."""
    m = re.search(r"^[ \t]+PreToolUse:\s*\n((?:[ \t]{3,}.*\n?)*)", hooks, re.M)
    for entry in re.split(r"^[ \t]*-[ \t]+matcher:", m.group(1) if m else "", flags=re.M)[1:]:
        if not re.match(r"\s*[\"']?Bash[\"']?\s*\n", entry):
            continue
        command = re.search(r"^\s*command:\s*(.*?)\s*$", entry, re.M)
        cmd = command.group(1).strip("'\"") if command else ""
        if "readonly-bash.py" in cmd:
            return []
        if "readonly-bash.ts" in cmd:
            return bun_hook_problems(cmd)
    return None


def check(path):
    out = []
    v = lambda rule, detail: out.append(f"{path.name}: {rule}: {detail}")
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        return [f"{path.name}: parse: unreadable ({type(e).__name__})"]
    fm, _ = split_frontmatter(text.replace("\r\n", "\n"))
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
    tools = csv(keys.get("tools", ""))
    disallowed = csv(keys.get("disallowedTools", ""))

    # Rule 3: names
    for where, names in (("tools", tools), ("disallowedTools", disallowed)):
        for n in names:
            ok = mcp_parts(n)[0] in MCP_SERVERS if n.startswith("mcp__") else n in BUILTIN
            if not ok:
                v("3", f"unknown tool name `{n}` in {where}")

    # Rule 4: read-only agents, judged from the effective tools (allowlist plus inline servers, minus
    # disallowedTools). Without a `tools` key the agent inherits everything, so it can't be one.
    has = [t for t in tools + [f"mcp__{s}__*" for s in servers] if t not in disallowed]
    if "tools" not in keys:
        if WRITERS <= set(disallowed):
            v("4", "read-only agents must use an allowlist")
    elif not WRITERS & set(has):
        if "memory" in keys:
            v("4", "read-only agent has a `memory` key")
        for t in READONLY_BANNED:
            if t in has:
                v("4", f"read-only agent has `{t}`")
        for n in tools:
            if n.startswith("mcp__") and n not in disallowed:
                server, tool = mcp_parts(n)
                if tool in (None, "*") and not MCP_SERVERS.get(server, True):
                    v("4", f"read-only agent has server `{n}` with write tools")
        for n in has:
            if n.startswith("mcp__") and has_write_verb(n):
                v("4", f"read-only agent has MCP tool `{n}` with a write verb")
        bash, hook = "Bash" in has, readonly_hook(hooks)
        if bash != (hook is not None):
            v("4", "read-only agent has Bash without a PreToolUse Bash readonly-bash.py hook" if bash
              else "read-only agent has the readonly-bash.py hook but no Bash")
        for problem in hook or []:
            v("4", f"read-only agent readonly-bash hook command {problem}")
    return out


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "agents"
    files = sorted(f for f in root.glob("*.md") if f.name not in DOCS)
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
