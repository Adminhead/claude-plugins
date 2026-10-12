#!/usr/bin/env bash
# Smoke test for agent-tools.py against fixture agents, one broken rule at a time.
# Each failing case compares the checker's exact output, so a fixture can't trip another rule unnoticed.
set -euo pipefail

script=$(cd "$(dirname "$0")" && pwd)/agent-tools.py
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

HOOK='hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: '"'"'python3 -I "$HOME/.claude/hooks/readonly-bash.py" || exit 2'"'"
CG='mcp__plugin_code-search_codegraph__codegraph_explore'
PY='python3 -I "$HOME/.claude/hooks/readonly-bash.py" || exit 2'
BUN='bun --no-env-file --config=/dev/null "$HOME/.claude/hooks/readonly-bash.ts" || exit 2'

# agent DIR NAME FRONTMATTER_LINES: write $tmp/<dir>/NAME.md
agent() {
  local dir=$1 name=$2 fm=$3
  mkdir -p "$tmp/$dir"
  printf -- '---\nname: %s\ndescription: x\n%s\n---\nBody.\n' "$name" "$fm" >"$tmp/$dir/$name.md"
}

# hook_with CMD: a PreToolUse Bash hook block, as the frontmatter spells it, that runs CMD.
hook_with() {
  printf 'hooks:\n  PreToolUse:\n    - matcher: "Bash"\n      hooks:\n        - type: command\n          command: '"'"'%s'"'"'\n' "$1"
}

# expect CASE WANT OUTPUT: run the checker on $tmp/CASE; output must equal OUTPUT exactly.
expect() {
  local dir=$1 want=$2 expected=$3 rc=0 out
  out=$(python3 "$script" "$tmp/$dir" 2>&1) || rc=$?
  ((rc == want)) || fail "$dir: exit $rc, want $want ($out)"
  [[ $out == "$expected" ]] || fail "$dir: output differs"$'\n'"want: $expected"$'\n'"got:  $out"
}

# Clean fixtures.
agent ok-allow ro "tools: Read, Glob, Grep, LSP, $CG"
agent ok-allow bash-ro "tools: Read, Bash, Glob, Grep
$HOOK"
agent ok-allow dis-ro "tools: Read, Glob, Grep, LSP
disallowedTools: LSP"
agent ok-inherit coder "disallowedTools: Agent, Workflow"
printf '# Agents\n\nGuidance, no frontmatter.\n' >"$tmp/ok-allow/CLAUDE.md"
expect ok-allow 0 "agent-tools: ok (3 agents)"
expect ok-inherit 0 "agent-tools: ok (1 agents)"

# An allowlist with a writer is not read-only, so Bash needs no hook and Skill is fine.
agent ok-writer w "tools: Read, Edit, Bash, Skill, mcp__plugin_code-search_grep-app__create_thing"
expect ok-writer 0 "agent-tools: ok (1 agents)"

# Inline server: its mcp__<server>__* wildcard joins the tool list, minus disallowedTools. A multi-line
# args list inside the server is not a second mcpServers entry.
SERVER_FM='tools: Read, Bash
disallowedTools: Edit, Write, NotebookEdit, mcp__playwright__browser_run_code_unsafe
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args:
        - "-y"
        - "@playwright/mcp"
'"$HOOK"
agent ok-server web "$SERVER_FM"
expect ok-server 0 "agent-tools: ok (1 agents)"

# Main-thread agent: exempt from rules 3-4, but it may not set `tools` (rule 5).
agent ok-orch orchestration "model: opus"
expect ok-orch 0 "agent-tools: ok (1 agents)"
agent r5-tools orchestration "tools: Read"
expect r5-tools 1 "orchestration.md: 5: main-thread agent must not set tools"

# Rule 3: tool specifier, unknown built-in, unknown MCP prefix (each in tools), and in disallowedTools.
agent r3-spec a "tools: Read, Glob, Grep, Bash(rg *)"
expect r3-spec 1 "a.md: 3: unknown tool name \`Bash(rg *)\` in tools"
agent r3-builtin a "tools: Read, Glob, Grep, NoSuchTool"
expect r3-builtin 1 "a.md: 3: unknown tool name \`NoSuchTool\` in tools"
agent r3-mcp a "tools: Read, Glob, Grep, mcp__nosuch__tool"
expect r3-mcp 1 "a.md: 3: unknown tool name \`mcp__nosuch__tool\` in tools"
agent r3-server a "tools: Read, Glob, Grep, mcp__nosuch"
expect r3-server 1 "a.md: 3: unknown tool name \`mcp__nosuch\` in tools"
agent r3-disallowed a "disallowedTools: Agent, NoSuchTool"
expect r3-disallowed 1 "a.md: 3: unknown tool name \`NoSuchTool\` in disallowedTools"
# PowerShell, TodoWrite and SubagentHandback are known built-ins.
agent ok-builtins ro "tools: Read, Glob, Grep, PowerShell, TodoWrite, SubagentHandback"
expect ok-builtins 0 "agent-tools: ok (1 agents)"

# Server-level grants: bare and `__*` forms of a read-only server pass in a read-only agent.
agent ok-server-grant ro "tools: Read, Glob, Grep, mcp__plugin_code-search_codegraph, mcp__coremods"
expect ok-server-grant 0 "agent-tools: ok (1 agents)"
agent ok-server-star ro "tools: Read, Glob, Grep, mcp__plugin_efficient-core_exa__*"
expect ok-server-star 0 "agent-tools: ok (1 agents)"
# A writer may deny a whole server and individual tools of a mixed one.
agent ok-dis-server coder "disallowedTools: Agent, mcp__claude-in-chrome, mcp__plugin_github_github__create_branch"
expect ok-dis-server 0 "agent-tools: ok (1 agents)"

# Rule 4: memory, banned tool, write-verb MCP tool, Bash without hook, hook without Bash.
agent r4-memory a "tools: Read, Glob, Grep
memory: user"
expect r4-memory 1 "a.md: 4: read-only agent has a \`memory\` key"
agent r4-skill a "tools: Read, Glob, Grep, Skill"
expect r4-skill 1 "a.md: 4: read-only agent has \`Skill\`"
V=mcp__plugin_code-search_grep-app__create_thing
agent r4-verb a "tools: Read, Glob, Grep, $V"
expect r4-verb 1 "a.md: 4: read-only agent has MCP tool \`$V\` with a write verb"
# A verb in the server part of the name does not count.
agent ok-verb-server ro "tools: Read, Glob, Grep, mcp__plugin_efficient-core_exa__web_fetch_exa"
expect ok-verb-server 0 "agent-tools: ok (1 agents)"
# The coremods git tools are known MCP tools; a write verb on that server still fails.
agent ok-coremods ro "tools: Read, Glob, Grep, mcp__coremods__git_log"
expect ok-coremods 0 "agent-tools: ok (1 agents)"
GW=mcp__coremods__git_push
agent r4-coremods a "tools: Read, Glob, Grep, $GW"
expect r4-coremods 1 "a.md: 4: read-only agent has MCP tool \`$GW\` with a write verb"
# A read-only agent may not take a whole server that has write tools, in either form.
agent r4-server-write a "tools: Read, Glob, Grep, mcp__plugin_github_github"
expect r4-server-write 1 "a.md: 4: read-only agent has server \`mcp__plugin_github_github\` with write tools"
agent r4-server-write-star a "tools: Read, Glob, Grep, mcp__claude-in-chrome__*"
expect r4-server-write-star 1 "a.md: 4: read-only agent has server \`mcp__claude-in-chrome__*\` with write tools"
agent r4-nohook a "tools: Read, Bash"
expect r4-nohook 1 "a.md: 4: read-only agent has Bash without a PreToolUse Bash readonly-bash.py hook"
agent r4-nobash a "tools: Read, Glob, Grep
$HOOK"
expect r4-nobash 1 "a.md: 4: read-only agent has the readonly-bash.py hook but no Bash"
# disallowedTools removes a tool from the effective list, so a disallowed Bash plus the hook still fails.
agent r4-dis-bash a "tools: Read, Bash
disallowedTools: Bash
$HOOK"
expect r4-dis-bash 1 "a.md: 4: read-only agent has the readonly-bash.py hook but no Bash"
# The Python hook command and the bun hook command (both isolation flags, then `|| exit 2`) are accepted.
agent ok-hook-py ro "tools: Read, Bash, Glob, Grep
$(hook_with "$PY")"
expect ok-hook-py 0 "agent-tools: ok (1 agents)"
agent ok-hook-bun ro "tools: Read, Bash, Glob, Grep
$(hook_with "$BUN")"
expect ok-hook-bun 0 "agent-tools: ok (1 agents)"
# A bun hook missing one isolation flag, the config flag, the exit guard or `bun` itself is rejected, naming the gap.
agent r4-bun-noenv a "tools: Read, Bash, Glob, Grep
$(hook_with 'bun --config=/dev/null "$HOME/.claude/hooks/readonly-bash.ts" || exit 2')"
expect r4-bun-noenv 1 "a.md: 4: read-only agent readonly-bash hook command is missing \`--no-env-file\`"
agent r4-bun-config a "tools: Read, Bash, Glob, Grep
$(hook_with 'bun --no-env-file "$HOME/.claude/hooks/readonly-bash.ts" || exit 2')"
expect r4-bun-config 1 "a.md: 4: read-only agent readonly-bash hook command is missing \`--config=/dev/null\`"
agent r4-bun-exit a "tools: Read, Bash, Glob, Grep
$(hook_with 'bun --no-env-file --config=/dev/null "$HOME/.claude/hooks/readonly-bash.ts"')"
expect r4-bun-exit 1 "a.md: 4: read-only agent readonly-bash hook command must end with \`|| exit 2\`"
agent r4-bun-node a "tools: Read, Bash, Glob, Grep
$(hook_with 'node --no-env-file --config=/dev/null "$HOME/.claude/hooks/readonly-bash.ts" || exit 2')"
expect r4-bun-node 1 "a.md: 4: read-only agent readonly-bash hook command must start with \`bun\`"
# The bun form is matched as a whole command: flags after the script, a suffixed flag, text after the
# exit guard, and a `#` comment that hides the real path are each rejected. A bun command for another
# script never names readonly-bash, so it is not read as the hook at all and gets the no-hook message.
agent r4-bun-after a "tools: Read, Bash, Glob, Grep
$(hook_with 'bun "$HOME/.claude/hooks/readonly-bash.ts" --no-env-file --config=/dev/null || exit 2')"
expect r4-bun-after 1 "a.md: 4: read-only agent readonly-bash hook command must be exactly \`bun --no-env-file --config=/dev/null \"\$HOME/.claude/hooks/readonly-bash.ts\" || exit 2\`"
agent r4-bun-suffix a "tools: Read, Bash, Glob, Grep
$(hook_with 'bun --no-env-file --config=/dev/null.x "$HOME/.claude/hooks/readonly-bash.ts" || exit 2')"
expect r4-bun-suffix 1 "a.md: 4: read-only agent readonly-bash hook command is missing \`--config=/dev/null\`"
agent r4-bun-tail a "tools: Read, Bash, Glob, Grep
$(hook_with 'bun --no-env-file --config=/dev/null "$HOME/.claude/hooks/readonly-bash.ts" || exit 2 ; rm -rf x')"
expect r4-bun-tail 1 "a.md: 4: read-only agent readonly-bash hook command must end with \`|| exit 2\`"
agent r4-bun-path a "tools: Read, Bash, Glob, Grep
$(hook_with 'bun --no-env-file --config=/dev/null /tmp/evil.ts || exit 2')"
expect r4-bun-path 1 "a.md: 4: read-only agent has Bash without a PreToolUse Bash readonly-bash.py hook"
agent r4-bun-hash a "tools: Read, Bash, Glob, Grep
$(hook_with 'bun --no-env-file --config=/dev/null evil.ts # readonly-bash.ts || exit 2')"
expect r4-bun-hash 1 "a.md: 4: read-only agent readonly-bash hook command must be exactly \`bun --no-env-file --config=/dev/null \"\$HOME/.claude/hooks/readonly-bash.ts\" || exit 2\`"

# Any one writer makes an allowlist agent a writer (Write alone, NotebookEdit alone).
agent ok-write w "tools: Read, Write, Bash
memory: user"
expect ok-write 0 "agent-tools: ok (1 agents)"
agent ok-nbedit w "tools: Read, NotebookEdit, Bash
memory: user"
expect ok-nbedit 0 "agent-tools: ok (1 agents)"
# A disallowed writer is not effective: the agent is read-only, so memory and the missing hook are flagged.
agent r4-dis-writer a "tools: Read, Edit, Bash
disallowedTools: Edit
memory: user"
expect r4-dis-writer 1 "a.md: 4: read-only agent has a \`memory\` key
a.md: 4: read-only agent has Bash without a PreToolUse Bash readonly-bash.py hook"
# Inline-server tools join the effective list: an explicitly listed write-verb tool is flagged,
# and a server wildcard (no verb) is not.
agent r4-server-verb a "tools: Read, mcp__playwright__browser_create_page
mcpServers:
  - playwright:
      type: stdio
      command: npx"
expect r4-server-verb 1 "a.md: 4: read-only agent has MCP tool \`mcp__playwright__browser_create_page\` with a write verb"
agent ok-server-wild a "tools: Read
mcpServers:
  - playwright:
      type: stdio
      command: npx"
expect ok-server-wild 0 "agent-tools: ok (1 agents)"
# No `tools` key inherits every session tool (MCP included): not read-only unless disallowedTools
# removes all three writers, and then it must use an allowlist.
agent ok-inherit-part a "disallowedTools: Edit, Write
memory: user"
expect ok-inherit-part 0 "agent-tools: ok (1 agents)"
agent r4-inherit a "disallowedTools: Edit, Write, NotebookEdit"
expect r4-inherit 1 "a.md: 4: read-only agents must use an allowlist"

# Parse failures: list-form tools, mcpServers reference, no frontmatter, unreadable file.
agent parse-list a "tools:
  - Read"
expect parse-list 1 "a.md: parse: frontmatter: \`tools\` must be a one-line comma-separated string, not list form"
agent parse-ref a "tools: Read
mcpServers:
  - playwright"
expect parse-ref 1 "a.md: parse: frontmatter: mcpServers entry \`playwright\` is a reference; only inline servers are supported"
mkdir -p "$tmp/parse-nofm" "$tmp/parse-bin" "$tmp/ok-eof"
printf -- 'No frontmatter.\n' >"$tmp/parse-nofm/a.md"
expect parse-nofm 1 "a.md: parse: no frontmatter"
printf -- '\xff\xfe' >"$tmp/parse-bin/a.md"
expect parse-bin 1 "a.md: parse: unreadable (UnicodeDecodeError)"
# Closing `---` at end of file with no newline is still frontmatter.
printf -- '---\nname: a\n---' >"$tmp/ok-eof/a.md"
expect ok-eof 0 "agent-tools: ok (1 agents)"
# CRLF line endings parse like LF.
agent ok-crlf ro "tools: Read, Glob, Grep"
sed -i 's/$/\r/' "$tmp/ok-crlf/ro.md"
expect ok-crlf 0 "agent-tools: ok (1 agents)"

echo "all agent-tools checks passed"
