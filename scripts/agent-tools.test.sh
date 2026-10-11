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

# agent NAME FRONTMATTER_LINES HAS LACKS: write $tmp/<case>/NAME.md
agent() {
  local dir=$1 name=$2 fm=$3 has=$4 lacks=$5
  mkdir -p "$tmp/$dir"
  printf -- '---\nname: %s\ndescription: x\n%s\n---\nBody.\n\n## Tools\n\n%s\n%s\n' \
    "$name" "$fm" "$has" "$lacks" >"$tmp/$dir/$name.md"
}

# expect CASE WANT OUTPUT: run the checker on $tmp/CASE; output must equal OUTPUT exactly.
expect() {
  local dir=$1 want=$2 expected=$3 rc=0 out
  out=$(python3 "$script" "$tmp/$dir" 2>&1) || rc=$?
  ((rc == want)) || fail "$dir: exit $rc, want $want ($out)"
  [[ $out == "$expected" ]] || fail "$dir: output differs"$'\n'"want: $expected"$'\n'"got:  $out"
}

# Shared Lacks lines for read-only allowlist agents.
RO_LACKS='Lacks: `Bash`, `Edit`, `Write`, `NotebookEdit`, `Agent`, `Skill`, `Monitor`.'
GLOB_NOT_LACKS='Lacks: `Bash`, `Edit`, `Write`, `NotebookEdit`, `Agent`, `Skill`, `Monitor`'

# Clean fixtures.
agent ok-allow ro "tools: Read, Glob, Grep, LSP, $CG" \
  "Has: \`Read\`, \`Glob\`, \`Grep\`, \`LSP\`, \`$CG\`." "$RO_LACKS"
agent ok-allow bash-ro "tools: Read, Bash, Glob, Grep
$HOOK" \
  'Has: `Read`, `Bash`, `Glob`, `Grep`.' \
  'Lacks: `Edit`, `Write`, `NotebookEdit`, `Agent`, `Skill`, `Monitor`.'
agent ok-allow dis-ro "tools: Read, Glob, Grep, LSP
disallowedTools: LSP" 'Has: `Read`, `Glob`, `Grep`.' \
  "$GLOB_NOT_LACKS, \`LSP\`."
agent ok-inherit coder "disallowedTools: Agent, Workflow" \
  'Has: all session tools except Lacks.' 'Lacks: `Agent`, `Workflow`.'
expect ok-allow 0 "agent-tools: ok (3 agents)"
expect ok-inherit 0 "agent-tools: ok (1 agents)"

# Inline server: Has gains mcp__<server>__*, minus disallowedTools. A multi-line args list
# inside the server is not a second mcpServers entry.
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
SERVER_LACKS='Lacks: `Edit`, `Write`, `NotebookEdit`, `Glob`, `Grep`, `Agent`, `Skill`, `Monitor`, `mcp__playwright__browser_run_code_unsafe`.'
agent ok-server web "$SERVER_FM" 'Has: `Read`, `Bash`, `mcp__playwright__*`.' "$SERVER_LACKS"
expect ok-server 0 "agent-tools: ok (1 agents)"

# Main-thread agent: exempt from rules 1-4, but it may not set `tools`.
agent ok-orch orchestration "model: opus" 'Has: x' 'Lacks: y'
expect ok-orch 0 "agent-tools: ok (1 agents)"
agent r5-tools orchestration "tools: Read" 'Has: x' 'Lacks: y'
expect r5-tools 1 "orchestration.md: 5: main-thread agent must not set tools"

# Rule 1: Has differs from tools.
agent r1-has a "tools: Read, Glob, Grep" 'Has: `Read`, `Glob`, `Grep`, `LSP`.' "$RO_LACKS"
expect r1-has 1 "a.md: 1: Has is ['Glob', 'Grep', 'LSP', 'Read'], frontmatter gives ['Glob', 'Grep', 'Read']"
# Rule 1: missing mcp__<server>__* wildcard in Has.
agent r1-wild a "$SERVER_FM" 'Has: `Read`, `Bash`.' "$SERVER_LACKS"
expect r1-wild 1 "a.md: 1: Has is ['Bash', 'Read'], frontmatter gives ['Bash', 'Read', 'mcp__playwright__*']"
# Rule 1: a disallowedTools entry removes an allowlisted tool, but Has keeps it and Lacks omits it.
agent r1-disallow a "tools: Read, Glob, Grep
disallowedTools: Glob" 'Has: `Read`, `Glob`, `Grep`.' "$RO_LACKS"
expect r1-disallow 1 "a.md: 1: Has is ['Glob', 'Grep', 'Read'], frontmatter gives ['Grep', 'Read']
a.md: 1: Lacks is missing disallowedTools entries: ['Glob']"
# Rule 1: Lacks omits a disallowedTools entry (allowlist and inherit).
agent r1-lacks a "tools: Read, Glob, Grep, LSP
disallowedTools: LSP" 'Has: `Read`, `Glob`, `Grep`.' "$RO_LACKS"
expect r1-lacks 1 "a.md: 1: Lacks is missing disallowedTools entries: ['LSP']"
agent r1-inherit a "disallowedTools: Agent, Workflow" 'Has: all session tools except Lacks.' 'Lacks: `Agent`.'
expect r1-inherit 1 "a.md: 1: Lacks is missing disallowedTools entries: ['Workflow']"
# Rule 1: Has and Lacks overlap.
agent r1-overlap a "tools: Read, Glob, Grep, LSP" 'Has: `Read`, `Glob`, `Grep`, `LSP`.' "$GLOB_NOT_LACKS, \`LSP\`."
expect r1-overlap 1 "a.md: 1: Has and Lacks overlap: ['LSP']"
# Rule 1: `tools` vs inherit statement, both directions.
agent r1-tools-inherit a "tools: Read, Glob, Grep" 'Has: all session tools except Lacks.' 'Lacks: `Agent`.'
expect r1-tools-inherit 1 "a.md: 1: frontmatter has \`tools\` but the body says it inherits all session tools"
agent r1-inherit-tools a "model: opus" \
  'Has: `Read`, `Bash`, `Edit`, `Write`, `NotebookEdit`, `Glob`, `Grep`, `Agent`, `Skill`, `Monitor`.' 'Lacks: none.'
expect r1-inherit-tools 1 "a.md: 1: frontmatter has no \`tools\` but the body lists a \`Has:\` line instead of the inherit statement"

# Rule 2: a core tool in neither line, and in both (a tool in both also overlaps, so rule 1 fires too).
agent r2-none a "tools: Read, Glob, Grep" 'Has: `Read`, `Glob`, `Grep`.' \
  'Lacks: `Bash`, `Edit`, `Write`, `NotebookEdit`, `Agent`, `Skill`.'
expect r2-none 1 "a.md: 2: core tool \`Monitor\` must appear in exactly one of Has or Lacks"
agent r2-both a "tools: Read, Glob, Grep" 'Has: `Read`, `Glob`, `Grep`.' "$GLOB_NOT_LACKS, \`Glob\`."
expect r2-both 1 "a.md: 1: Has and Lacks overlap: ['Glob']
a.md: 2: core tool \`Glob\` must appear in exactly one of Has or Lacks"

# Rule 3: tool specifier, unknown built-in, unknown MCP prefix (each name appears in tools and Has).
agent r3-spec a "tools: Read, Glob, Grep, Bash(rg *)" 'Has: `Read`, `Glob`, `Grep`, `Bash(rg *)`.' \
  'Lacks: `Edit`, `Write`, `NotebookEdit`, `Agent`, `Skill`, `Monitor`, `Bash`.'
expect r3-spec 1 "a.md: 3: unknown tool name \`Bash(rg *)\` in tools
a.md: 3: unknown tool name \`Bash(rg *)\` in Has"
agent r3-builtin a "tools: Read, Glob, Grep, TodoWrite" 'Has: `Read`, `Glob`, `Grep`, `TodoWrite`.' "$RO_LACKS"
expect r3-builtin 1 "a.md: 3: unknown tool name \`TodoWrite\` in tools
a.md: 3: unknown tool name \`TodoWrite\` in Has"
agent r3-mcp a "tools: Read, Glob, Grep, mcp__nosuch__tool" 'Has: `Read`, `Glob`, `Grep`, `mcp__nosuch__tool`.' "$RO_LACKS"
expect r3-mcp 1 "a.md: 3: unknown tool name \`mcp__nosuch__tool\` in tools
a.md: 3: unknown tool name \`mcp__nosuch__tool\` in Has"

# Rule 4: memory, banned tool, write-verb MCP tool, Bash without hook, hook without Bash, inheriting read-only.
agent r4-memory a "tools: Read, Glob, Grep
memory: user" 'Has: `Read`, `Glob`, `Grep`.' "$RO_LACKS"
expect r4-memory 1 "a.md: 4: read-only agent has a \`memory\` key"
agent r4-skill a "tools: Read, Glob, Grep, Skill" 'Has: `Read`, `Glob`, `Grep`, `Skill`.' \
  'Lacks: `Bash`, `Edit`, `Write`, `NotebookEdit`, `Agent`, `Monitor`.'
expect r4-skill 1 "a.md: 4: read-only agent has \`Skill\`"
V=mcp__plugin_code-search_grep-app__create_thing
agent r4-verb a "tools: Read, Glob, Grep, $V" "Has: \`Read\`, \`Glob\`, \`Grep\`, \`$V\`." "$RO_LACKS"
expect r4-verb 1 "a.md: 4: read-only agent has MCP tool \`$V\` with a write verb"
# A verb in the server part of the name does not count.
agent ok-verb-server ro "tools: Read, Glob, Grep, mcp__plugin_efficient-core_exa__web_fetch_exa" \
  'Has: `Read`, `Glob`, `Grep`, `mcp__plugin_efficient-core_exa__web_fetch_exa`.' "$RO_LACKS"
expect ok-verb-server 0 "agent-tools: ok (1 agents)"
agent r4-nohook a "tools: Read, Bash" 'Has: `Read`, `Bash`.' \
  'Lacks: `Glob`, `Grep`, `Edit`, `Write`, `NotebookEdit`, `Agent`, `Skill`, `Monitor`.'
expect r4-nohook 1 "a.md: 4: read-only agent has Bash without a PreToolUse Bash readonly-bash.py hook"
agent r4-nobash a "tools: Read, Glob, Grep
$HOOK" 'Has: `Read`, `Glob`, `Grep`.' "$RO_LACKS"
expect r4-nobash 1 "a.md: 4: read-only agent has the readonly-bash.py hook but no Bash"
agent r4-inherit a "disallowedTools: Edit, Write, NotebookEdit" 'Has: all session tools except Lacks.' \
  'Lacks: `Edit`, `Write`, `NotebookEdit`.'
expect r4-inherit 1 "a.md: 4: read-only agents must use an allowlist"

# Parse failures: list-form tools, mcpServers reference, missing Tools section, no frontmatter,
# unreadable file.
agent parse-list a "tools:
  - Read" 'Has: `Read`.' 'Lacks: `Bash`.'
expect parse-list 1 "a.md: parse: frontmatter: \`tools\` must be a one-line comma-separated string, not list form"
agent parse-ref a "tools: Read
mcpServers:
  - playwright" 'Has: `Read`.' 'Lacks: `Bash`.'
expect parse-ref 1 "a.md: parse: frontmatter: mcpServers entry \`playwright\` is a reference; only inline servers are supported"
mkdir -p "$tmp/parse-none" "$tmp/parse-nofm" "$tmp/parse-bin" "$tmp/ok-eof" "$tmp/ok-crlf"
printf -- '---\nname: a\n---\nNo tools here.\n' >"$tmp/parse-none/a.md"
expect parse-none 1 "a.md: parse: ## Tools section needs a \`Has:\` line (or \`Has: all session tools except Lacks.\`) and a \`Lacks:\` line"
printf -- 'No frontmatter.\n' >"$tmp/parse-nofm/a.md"
expect parse-nofm 1 "a.md: parse: no frontmatter"
printf -- '\xff\xfe' >"$tmp/parse-bin/a.md"
expect parse-bin 1 "a.md: parse: unreadable (UnicodeDecodeError)"
# Closing `---` at end of file with no newline is still frontmatter.
printf -- '---\nname: a\n---' >"$tmp/ok-eof/a.md"
expect ok-eof 1 "a.md: parse: ## Tools section needs a \`Has:\` line (or \`Has: all session tools except Lacks.\`) and a \`Lacks:\` line"
# CRLF line endings parse like LF.
agent ok-crlf ro "tools: Read, Glob, Grep" 'Has: `Read`, `Glob`, `Grep`.' "$RO_LACKS"
sed -i 's/$/\r/' "$tmp/ok-crlf/ro.md"
expect ok-crlf 0 "agent-tools: ok (1 agents)"

echo "all agent-tools checks passed"
