#!/usr/bin/env python3
"""Check the crew plugin's agents and the hooks.json gates that guard them.

Usage: agent-tools.py [AGENTS_DIR]   (default: plugins/crew/agents under this script's repo root)

The plugin is AGENTS_DIR's parent: hooks/hooks.json and scripts/readonly-gate.{ts,py} sit beside it.
READ_ONLY is the union of the `READ_ONLY` constants in readonly-gate.ts and readonly-gate.py.

Rules:
  3  every name in `tools` and `disallowedTools` is a known builtin or an MCP entry on a known server:
     `mcp__<server>`, `mcp__<server>__*` or `mcp__<server>__<tool>` (MCP_SERVERS).
  4  an agent is read-only when it is in READ_ONLY, or when its `tools` allowlist (minus
     `disallowedTools`) holds none of Edit/Write/NotebookEdit. A read-only agent has no `memory` key,
     none of READONLY_BANNED, no server-level grant of a server with write tools (WRITE_SERVER_GRANTS
     excepted) and no MCP tool with a write verb. Only members of READ_ONLY have Bash. A member uses an
     allowlist with no writer, so a dropped allowlist or an added Edit can't reclassify it silently.
     An agent without `tools` inherits every session tool, so one that disallows all three writers
     must use an allowlist instead.
  5  orchestration.md runs as the session itself and must not set `tools`.
  6  every agent file has `name` and `description`, and none of IGNORED_FIELDS, which plugin agents
     ignore without warning.
  7  READ_ONLY is declared in both gates, the two sets are disjoint, every name is `crew:<agent>`, and
     every member has an agent file.
  8  hooks.json holds both exact gate commands as PreToolUse `Bash` hooks, each with `timeout: 30` and
     `onFailure: "block"`, plus the four orchestration-guard entries.
  9  every `skills` preload `<plugin>:<skill>` resolves to plugins/<plugin>/skills/<skill>/SKILL.md, except
     plugins outside this marketplace (THIRD_PARTY).

Prints one `<file>: <rule>: <detail>` line per violation and exits 1, or
`agent-tools: ok (<n> agents)` and exits 0.
"""
import json
import re
import sys
from pathlib import Path

PLUGIN = "crew"
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
    "plugin_research_exa": True,
    "coremods": True,
    "plugin_web_playwright": False,
    "plugin_github_github": False,
    "claude-in-chrome": False,
}
# Agents that may take a server-level grant of a server with write tools: browser-tester drives a
# browser and disallows the one tool that runs arbitrary code.
WRITE_SERVER_GRANTS = {"browser-tester": {"plugin_web_playwright"}}
WRITERS = {"Edit", "Write", "NotebookEdit"}
READONLY_BANNED = ["Skill", "SendMessage", "Monitor", "Artifact", "EnterWorktree", "Agent", "PowerShell"]
WRITE_VERBS = (
    "write", "edit", "create", "delete", "update", "merge", "push", "commit", "upload", "move",
    "save", "add", "comment", "assign", "fork", "request", "run", "send", "close", "remove", "set", "post",
)
IGNORED_FIELDS = ("hooks", "mcpServers", "permissionMode", "initialPrompt")
THIRD_PARTY = {"avoid-ai-writing"}  # preload prefixes that name plugins from other marketplaces
MAIN_THREAD = "orchestration.md"  # runs as the session itself, so it is exempt from rules 3-4

TS_GATE_CMD = 'bun --no-env-file --config=/dev/null "${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.ts" || exit 2'
PY_GATE_CMD = 'python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.py" || exit 2'
# Fields both gate hooks must carry (Claude Code 2.1.295+ for onFailure).
GATE_FIELDS = {"timeout": 30, "onFailure": "block"}
GUARD = 'python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/orchestration-guard.py" %s'
# (event, matcher, command) for every hooks.json entry the plugin needs.
EXPECTED_HOOKS = [
    ("PreToolUse", "Bash", TS_GATE_CMD),
    ("PreToolUse", "Bash", PY_GATE_CMD),
    ("Stop", None, GUARD % "stop"),
    ("UserPromptSubmit", None, GUARD % "prompt"),
    ("PostToolUse", "TaskCreate|TaskUpdate", GUARD % "ledger"),
    ("PostToolUse", "Edit|Write|NotebookEdit", GUARD % "edit"),
]
GATES = {
    "readonly-gate.ts": re.compile(r"const READ_ONLY = \[(.*?)\]", re.S),
    "readonly-gate.py": re.compile(r"^READ_ONLY = \((.*?)\)", re.S | re.M),
}


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
    """Return (top-level scalar keys, errors)."""
    keys, errors = {}, []
    for line in fm.split("\n"):
        m = re.match(r"([A-Za-z]+):\s*(.*)$", line)
        if m:
            keys[m.group(1)] = m.group(2).strip()
    for k in ("tools", "disallowedTools"):
        if k in keys and keys[k] == "":
            errors.append(f"frontmatter: `{k}` must be a one-line comma-separated string, not list form")
    return keys, errors


def preloads(fm):
    """Return the entries of the `skills:` list in a frontmatter block."""
    m = re.search(r"^skills:[ \t]*\n((?:[ \t]+-[ \t]*\S.*\n?)+)", fm + "\n", re.M)
    return re.findall(r"^[ \t]+-[ \t]*(\S+)", m.group(1), re.M) if m else []


def check(path, read_only, plugins):
    out = []
    v = lambda rule, detail: out.append(f"{path.name}: {rule}: {detail}")
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        return [f"{path.name}: parse: unreadable ({type(e).__name__})"]
    fm, _ = split_frontmatter(text.replace("\r\n", "\n"))
    if fm is None:
        return [f"{path.name}: parse: no frontmatter"]
    keys, errors = parse_frontmatter(fm)
    for e in errors:
        v("parse", e)
    if errors:
        return out

    # Rule 6: required and ignored fields
    for k in ("name", "description"):
        if not keys.get(k):
            v("6", f"missing `{k}`")
    for k in IGNORED_FIELDS:
        if k in keys:
            v("6", f"`{k}` is ignored in plugin agents")
    for entry in preloads(fm):
        plugin, _, skill = entry.partition(":")
        if plugin not in THIRD_PARTY and not (plugins / plugin / "skills" / skill / "SKILL.md").is_file():
            v("9", f"skills preload `{entry}` does not resolve to plugins/{plugin}/skills/{skill}/SKILL.md")
    if path.name == MAIN_THREAD:
        # A `tools` key would narrow the whole session, not just this agent.
        if "tools" in keys:
            v("5", "main-thread agent must not set tools")
        return out
    tools = csv(keys.get("tools", ""))
    disallowed = csv(keys.get("disallowedTools", ""))
    name = keys.get("name") or path.stem

    # Rule 3: names
    for where, names in (("tools", tools), ("disallowedTools", disallowed)):
        for n in names:
            ok = mcp_parts(n)[0] in MCP_SERVERS if n.startswith("mcp__") else n in BUILTIN
            if not ok:
                v("3", f"unknown tool name `{n}` in {where}")

    # Rule 4: read-only agents. Without a `tools` key the agent inherits everything, so only a
    # member of READ_ONLY can be one, and it must use an allowlist.
    has = [t for t in tools if t not in disallowed]
    member = f"{PLUGIN}:{name}" in read_only
    if "tools" not in keys:
        if member:
            v("4", "read-only agent must use an allowlist")
        elif WRITERS <= set(disallowed):
            v("4", "read-only agents must use an allowlist")
        return out
    if member:
        for t in sorted(WRITERS & set(has)):
            v("4", f"read-only agent has writer `{t}`")
    if member or not WRITERS & set(has):
        if "memory" in keys:
            v("4", "read-only agent has a `memory` key")
        for t in READONLY_BANNED:
            if t in has:
                v("4", f"read-only agent has `{t}`")
        for n in tools:
            if n.startswith("mcp__") and n not in disallowed:
                server, tool = mcp_parts(n)
                if tool in (None, "*") and not MCP_SERVERS.get(server, True) and server not in WRITE_SERVER_GRANTS.get(name, ()):
                    v("4", f"read-only agent has server `{n}` with write tools")
        for n in has:
            if n.startswith("mcp__") and has_write_verb(n):
                v("4", f"read-only agent has MCP tool `{n}` with a write verb")
        if "Bash" in has and not member:
            v("4", "read-only agent has Bash but is not in READ_ONLY")
    return out


def gate_sets(plugin):
    """Return ({gate file: set of names}, problems) from the READ_ONLY constants of both gates."""
    sets, problems = {}, []
    for gate, pattern in GATES.items():
        try:
            m = pattern.search((plugin / "scripts" / gate).read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError) as e:
            problems.append(f"{gate}: 7: unreadable ({type(e).__name__})")
            continue
        names = re.findall(r"""['"]([^'"]+)['"]""", m.group(1)) if m else []
        if not names:
            problems.append(f"{gate}: 7: no READ_ONLY constant with names")
            continue
        sets[gate] = set(names)
        for n in sorted(sets[gate]):
            if not re.fullmatch(rf"{PLUGIN}:[A-Za-z][\w-]*", n):
                problems.append(f"{gate}: 7: READ_ONLY name `{n}` is not `{PLUGIN}:<agent>`")
    if len(sets) == 2:
        for n in sorted(sets["readonly-gate.ts"] & sets["readonly-gate.py"]):
            problems.append(f"readonly-gate: 7: `{n}` is in both READ_ONLY sets")
    return sets, problems


def check_hooks(plugin):
    path = plugin / "hooks" / "hooks.json"
    try:
        events = json.loads(path.read_text(encoding="utf-8"))["hooks"]
    except (OSError, ValueError, KeyError, TypeError) as e:
        return [f"hooks.json: 8: unreadable or no `hooks` ({type(e).__name__})"]

    def hooks_for(event, matcher):
        found = []
        for entry in events.get(event, []) if isinstance(events, dict) else []:
            if isinstance(entry, dict) and entry.get("matcher") == matcher:
                found += [h for h in entry.get("hooks", []) if isinstance(h, dict)]
        return found

    out = []
    for event, matcher, cmd in EXPECTED_HOOKS:
        matching = [h for h in hooks_for(event, matcher) if h.get("command") == cmd]
        if not matching:
            out.append(f"hooks.json: 8: missing {event}{f' {matcher}' if matcher else ''} command `{cmd}`")
        elif cmd in (TS_GATE_CMD, PY_GATE_CMD):
            # A timed-out or failed hook otherwise lets the call through, so `|| exit 2` alone isn't a gate.
            for field, want in GATE_FIELDS.items():
                if not any(h.get(field) == want for h in matching):
                    out.append(f"hooks.json: 8: gate command `{cmd}` needs `{field}: {json.dumps(want)}`")
    for h in hooks_for("PreToolUse", "Bash"):
        if "readonly-gate" in str(h.get("command")) and h.get("command") not in (TS_GATE_CMD, PY_GATE_CMD):
            out.append(f"hooks.json: 8: PreToolUse Bash command `{h.get('command')}` is not an exact gate command")
    return out


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "plugins" / PLUGIN / "agents"
    files = sorted(root.glob("*.md"))
    if not files:
        print(f"agent-tools: no agents in {root}", file=sys.stderr)
        return 1
    sets, problems = gate_sets(root.parent)
    read_only = set().union(*sets.values())
    problems += [p for f in files for p in check(f, read_only, root.parent.parent)]
    stems = {f.stem for f in files}  # agent files are named after `name`
    problems += [f"readonly-gate: 7: READ_ONLY member `{n}` has no agent file" for n in sorted(read_only) if n.split(":", 1)[-1] not in stems]
    problems += check_hooks(root.parent)
    if problems:
        print("\n".join(problems))
        return 1
    print(f"agent-tools: ok ({len(files)} agents)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
