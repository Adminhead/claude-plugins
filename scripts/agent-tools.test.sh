#!/usr/bin/env bash
# Smoke test for agent-tools.py against fixture plugins, one broken rule at a time.
# Each failing case compares the checker's exact output, so a fixture can't trip another rule unnoticed.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
script=$repo/scripts/agent-tools.py
good_hooks=$repo/plugins/crew/hooks/hooks.json
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

CG='mcp__plugin_code-search_codegraph__codegraph_explore'
PW=mcp__plugin_efficient-web_playwright
TS_CMD='bun --no-env-file --config=/dev/null "${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.ts" || exit 2'
PY_CMD='python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.py" || exit 2'
STOP_CMD='python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/orchestration-guard.py" stop'

# scaffold CASE: a fixture plugin with both gates, the good hooks.json, and one member per gate
# (rts for the .ts gate, rpy for the .py gate). Every case counts these two agents.
scaffold() {
  local d=$tmp/$1
  [[ -d $d/scripts ]] && return
  mkdir -p "$d/scripts" "$d/hooks" "$d/agents"
  printf "const READ_ONLY = [\n  'crew:rts',\n]\n" >"$d/scripts/readonly-gate.ts"
  printf 'READ_ONLY = (\n    "crew:rpy",\n)\n' >"$d/scripts/readonly-gate.py"
  cp "$good_hooks" "$d/hooks/hooks.json"
  for m in rts rpy; do
    printf -- '---\nname: %s\ndescription: x\ntools: Read, Bash, Glob, Grep\n---\nBody.\n' "$m" >"$d/agents/$m.md"
  done
}

# agent CASE NAME FRONTMATTER_LINES: write $tmp/<case>/agents/NAME.md
agent() {
  local dir=$1 name=$2 fm=$3
  scaffold "$dir"
  printf -- '---\nname: %s\ndescription: x\n%s\n---\nBody.\n' "$name" "$fm" >"$tmp/$dir/agents/$name.md"
}

# gate_ts CASE NAMES / gate_py CASE NAMES: rewrite a gate's READ_ONLY constant (one name per line).
gate_ts() { scaffold "$1"; { echo 'const READ_ONLY = ['; printf "  '%s',\n" "${@:2}"; echo ']'; } >"$tmp/$1/scripts/readonly-gate.ts"; }
gate_py() { scaffold "$1"; { echo 'READ_ONLY = ('; printf '    "%s",\n' "${@:2}"; echo ')'; } >"$tmp/$1/scripts/readonly-gate.py"; }

# hooks_edit CASE JQ_FILTER: edit the case's hooks.json.
hooks_edit() { scaffold "$1"; jq "$2" "$tmp/$1/hooks/hooks.json" >"$tmp/$1/hooks.new" && mv "$tmp/$1/hooks.new" "$tmp/$1/hooks/hooks.json"; }

# ok N: the success line for N fixture agents beyond the two members.
ok() { echo "agent-tools: ok ($(($1 + 2)) agents)"; }

# expect CASE WANT OUTPUT: run the checker on $tmp/CASE/agents; output must equal OUTPUT exactly.
expect() {
  local dir=$1 want=$2 expected=$3 rc=0 out
  out=$(python3 "$script" "$tmp/$dir/agents" 2>&1) || rc=$?
  ((rc == want)) || fail "$dir: exit $rc, want $want ($out)"
  [[ $out == "$expected" ]] || fail "$dir: output differs"$'\n'"want: $expected"$'\n'"got:  $out"
}

# The real plugin passes.
out=$(python3 "$script") || fail "real plugin: $out"

# Clean fixtures.
agent ok-allow ro "tools: Read, Glob, Grep, LSP, $CG"
agent ok-allow dis-ro "tools: Read, Glob, Grep, LSP
disallowedTools: LSP"
expect ok-allow 0 "$(ok 2)"
agent ok-inherit coder "disallowedTools: Agent, Workflow"
expect ok-inherit 0 "$(ok 1)"

# An allowlist with a writer is not read-only, so Bash, Agent and Skill are fine.
agent ok-writer w "tools: Read, Edit, Bash, Skill, Agent, mcp__plugin_code-search_grep-app__create_thing"
expect ok-writer 0 "$(ok 1)"

# browser-tester may take the whole playwright server; any other read-only agent may not.
gate_py ok-browser crew:rpy crew:browser-tester
agent ok-browser browser-tester "tools: Read, Bash, $PW
disallowedTools: ${PW}__browser_run_code_unsafe"
expect ok-browser 0 "$(ok 1)"
agent r4-browser-other a "tools: Read, $PW"
expect r4-browser-other 1 "a.md: 4: read-only agent has server \`$PW\` with write tools"

# Main-thread agent: exempt from rules 3-4, but it may not set `tools` (rule 5).
agent ok-orch orchestration "model: opus"
expect ok-orch 0 "$(ok 1)"
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
# TodoWrite and SubagentHandback are known built-ins.
agent ok-builtins ro "tools: Read, Glob, Grep, TodoWrite, SubagentHandback"
expect ok-builtins 0 "$(ok 1)"

# Server-level grants: bare and `__*` forms of a read-only server pass in a read-only agent.
agent ok-server-grant ro "tools: Read, Glob, Grep, mcp__plugin_code-search_codegraph, mcp__coremods"
expect ok-server-grant 0 "$(ok 1)"
agent ok-server-star ro "tools: Read, Glob, Grep, mcp__plugin_efficient-core_exa__*"
expect ok-server-star 0 "$(ok 1)"
# A writer may deny a whole server and individual tools of a mixed one.
agent ok-dis-server coder "disallowedTools: Agent, mcp__claude-in-chrome, mcp__plugin_github_github__create_branch"
expect ok-dis-server 0 "$(ok 1)"

# Rule 4: memory, banned tool, write-verb MCP tool, server with write tools.
agent r4-memory a "tools: Read, Glob, Grep
memory: user"
expect r4-memory 1 "a.md: 4: read-only agent has a \`memory\` key"
agent r4-skill a "tools: Read, Glob, Grep, Skill"
expect r4-skill 1 "a.md: 4: read-only agent has \`Skill\`"
agent r4-agent a "tools: Read, Glob, Grep, Agent"
expect r4-agent 1 "a.md: 4: read-only agent has \`Agent\`"
agent r4-powershell a "tools: Read, Glob, Grep, PowerShell"
expect r4-powershell 1 "a.md: 4: read-only agent has \`PowerShell\`"
V=mcp__plugin_code-search_grep-app__create_thing
agent r4-verb a "tools: Read, Glob, Grep, $V"
expect r4-verb 1 "a.md: 4: read-only agent has MCP tool \`$V\` with a write verb"
# A verb in the server part of the name does not count.
agent ok-verb-server ro "tools: Read, Glob, Grep, mcp__plugin_efficient-core_exa__web_fetch_exa"
expect ok-verb-server 0 "$(ok 1)"
# The coremods git tools are known MCP tools; a write verb on that server still fails.
agent ok-coremods ro "tools: Read, Glob, Grep, mcp__coremods__git_log"
expect ok-coremods 0 "$(ok 1)"
GW=mcp__coremods__git_push
agent r4-coremods a "tools: Read, Glob, Grep, $GW"
expect r4-coremods 1 "a.md: 4: read-only agent has MCP tool \`$GW\` with a write verb"
agent r4-server-write a "tools: Read, Glob, Grep, mcp__plugin_github_github"
expect r4-server-write 1 "a.md: 4: read-only agent has server \`mcp__plugin_github_github\` with write tools"
agent r4-server-write-star a "tools: Read, Glob, Grep, mcp__claude-in-chrome__*"
expect r4-server-write-star 1 "a.md: 4: read-only agent has server \`mcp__claude-in-chrome__*\` with write tools"

# Rule 4: Bash belongs to READ_ONLY members only.
agent r4-bash-nonmember a "tools: Read, Bash"
expect r4-bash-nonmember 1 "a.md: 4: read-only agent has Bash but is not in READ_ONLY"
# disallowedTools removes a tool from the effective list, so a disallowed Bash is not Bash.
agent ok-dis-bash a "tools: Read, Bash
disallowedTools: Bash"
expect ok-dis-bash 0 "$(ok 1)"
# A member with a writer, or with no allowlist, is flagged instead of silently reclassified.
agent r4-member-writer rpy "tools: Read, Bash, Edit"
expect r4-member-writer 1 "rpy.md: 4: read-only agent has writer \`Edit\`"
agent r4-member-write rts "tools: Read, Bash, Write, NotebookEdit"
expect r4-member-write 1 "rts.md: 4: read-only agent has writer \`NotebookEdit\`
rts.md: 4: read-only agent has writer \`Write\`"
agent r4-member-inherit rpy "disallowedTools: Agent"
expect r4-member-inherit 1 "rpy.md: 4: read-only agent must use an allowlist"
agent r4-member-agent rts "tools: Read, Bash, Agent, PowerShell"
expect r4-member-agent 1 "rts.md: 4: read-only agent has \`Agent\`
rts.md: 4: read-only agent has \`PowerShell\`"
agent r4-member-memory rpy "tools: Read, Bash
memory: user"
expect r4-member-memory 1 "rpy.md: 4: read-only agent has a \`memory\` key"
# Any one writer makes a non-member allowlist agent a writer (Write alone, NotebookEdit alone).
agent ok-write w "tools: Read, Write, Bash
memory: user"
expect ok-write 0 "$(ok 1)"
agent ok-nbedit w "tools: Read, NotebookEdit, Bash
memory: user"
expect ok-nbedit 0 "$(ok 1)"
# A disallowed writer is not effective: the agent is read-only, so memory and Bash are flagged.
agent r4-dis-writer a "tools: Read, Edit, Bash
disallowedTools: Edit
memory: user"
expect r4-dis-writer 1 "a.md: 4: read-only agent has a \`memory\` key
a.md: 4: read-only agent has Bash but is not in READ_ONLY"
# No `tools` key inherits every session tool: not read-only unless disallowedTools removes all three
# writers, and then it must use an allowlist.
agent ok-inherit-part a "disallowedTools: Edit, Write
memory: user"
expect ok-inherit-part 0 "$(ok 1)"
agent r4-inherit a "disallowedTools: Edit, Write, NotebookEdit"
expect r4-inherit 1 "a.md: 4: read-only agents must use an allowlist"

# Rule 6: fields plugin agents ignore, and the required name and description.
agent r6-hooks a "tools: Read, Glob, Grep
hooks:
  Stop: []"
expect r6-hooks 1 "a.md: 6: \`hooks\` is ignored in plugin agents"
agent r6-mcp a "tools: Read, Glob, Grep
mcpServers:
  - playwright"
expect r6-mcp 1 "a.md: 6: \`mcpServers\` is ignored in plugin agents"
agent r6-perm a "tools: Read, Glob, Grep
permissionMode: plan"
expect r6-perm 1 "a.md: 6: \`permissionMode\` is ignored in plugin agents"
agent r6-prompt a "tools: Read, Glob, Grep
initialPrompt: hi"
expect r6-prompt 1 "a.md: 6: \`initialPrompt\` is ignored in plugin agents"
scaffold r6-noname
printf -- '---\ndescription: x\n---\nBody.\n' >"$tmp/r6-noname/agents/a.md"
expect r6-noname 1 "a.md: 6: missing \`name\`"
scaffold r6-nodesc
printf -- '---\nname: a\n---\nBody.\n' >"$tmp/r6-nodesc/agents/a.md"
expect r6-nodesc 1 "a.md: 6: missing \`description\`"
# A docs file in agents/ would load as an agent, so it fails like any file with no frontmatter.
scaffold r6-docs
printf '# Agents\n\nGuidance, no frontmatter.\n' >"$tmp/r6-docs/agents/CLAUDE.md"
expect r6-docs 1 "CLAUDE.md: parse: no frontmatter"

# Rule 7: the READ_ONLY constants.
gate_ts r7-overlap crew:rts
gate_py r7-overlap crew:rpy crew:rts
expect r7-overlap 1 "readonly-gate: 7: \`crew:rts\` is in both READ_ONLY sets"
gate_py r7-name crew:rpy other:x
expect r7-name 1 "readonly-gate.py: 7: READ_ONLY name \`other:x\` is not \`crew:<agent>\`
readonly-gate: 7: READ_ONLY member \`other:x\` has no agent file"
gate_py r7-ghost crew:rpy crew:ghost
expect r7-ghost 1 "readonly-gate: 7: READ_ONLY member \`crew:ghost\` has no agent file"
scaffold r7-noconst
printf 'x = 1\n' >"$tmp/r7-noconst/scripts/readonly-gate.py"
expect r7-noconst 1 "readonly-gate.py: 7: no READ_ONLY constant with names
rpy.md: 4: read-only agent has Bash but is not in READ_ONLY"
scaffold r7-nogate
rm "$tmp/r7-nogate/scripts/readonly-gate.ts"
expect r7-nogate 1 "readonly-gate.ts: 7: unreadable (FileNotFoundError)
rts.md: 4: read-only agent has Bash but is not in READ_ONLY"

# Rule 8: hooks.json holds both exact gate commands and the four guard entries.
hooks_edit r8-nots '.hooks.PreToolUse |= map(select(.hooks[0].command | contains("gate.ts") | not))'
expect r8-nots 1 "hooks.json: 8: missing PreToolUse Bash command \`$TS_CMD\`"
hooks_edit r8-wrong '(.hooks.PreToolUse[] | select(.hooks[0].command | contains("gate.py")) | .hooks[0].command) = "python3 \"${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.py\" || exit 2"'
expect r8-wrong 1 "hooks.json: 8: missing PreToolUse Bash command \`python3 -I \"\${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.py\" || exit 2\`
hooks.json: 8: PreToolUse Bash command \`python3 \"\${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.py\" || exit 2\` is not an exact gate command"
hooks_edit r8-nostop 'del(.hooks.Stop)'
expect r8-nostop 1 "hooks.json: 8: missing Stop command \`$STOP_CMD\`"
# A gate hook without the timeout or onFailure fields fails open on a timeout.
hooks_edit r8-notimeout '(.hooks.PreToolUse[] | select(.hooks[0].command | contains("gate.ts")) | .hooks[0]) |= del(.timeout)'
expect r8-notimeout 1 "hooks.json: 8: gate command \`$TS_CMD\` needs \`timeout: 30\`"
hooks_edit r8-slow '(.hooks.PreToolUse[] | select(.hooks[0].command | contains("gate.ts")) | .hooks[0].timeout) = 600'
expect r8-slow 1 "hooks.json: 8: gate command \`$TS_CMD\` needs \`timeout: 30\`"
hooks_edit r8-noonfailure '(.hooks.PreToolUse[] | select(.hooks[0].command | contains("gate.py")) | .hooks[0]) |= del(.onFailure)'
expect r8-noonfailure 1 "hooks.json: 8: gate command \`$PY_CMD\` needs \`onFailure: \"block\"\`"
hooks_edit r8-continue '(.hooks.PreToolUse[] | select(.hooks[0].command | contains("gate.py")) | .hooks[0].onFailure) = "continue"'
expect r8-continue 1 "hooks.json: 8: gate command \`$PY_CMD\` needs \`onFailure: \"block\"\`"
hooks_edit r8-nomatcher '.hooks.PreToolUse |= map(del(.matcher))'
expect r8-nomatcher 1 "hooks.json: 8: missing PreToolUse Bash command \`$TS_CMD\`
hooks.json: 8: missing PreToolUse Bash command \`python3 -I \"\${CLAUDE_PLUGIN_ROOT}/scripts/readonly-gate.py\" || exit 2\`"
scaffold r8-bad
printf '{not json' >"$tmp/r8-bad/hooks/hooks.json"
expect r8-bad 1 "hooks.json: 8: unreadable or no \`hooks\` (JSONDecodeError)"
scaffold r8-gone
rm "$tmp/r8-gone/hooks/hooks.json"
expect r8-gone 1 "hooks.json: 8: unreadable or no \`hooks\` (FileNotFoundError)"

# Parse failures: list-form tools, no frontmatter, unreadable file.
agent parse-list a "tools:
  - Read"
expect parse-list 1 "a.md: parse: frontmatter: \`tools\` must be a one-line comma-separated string, not list form"
scaffold parse-nofm
printf -- 'No frontmatter.\n' >"$tmp/parse-nofm/agents/a.md"
expect parse-nofm 1 "a.md: parse: no frontmatter"
scaffold parse-bin
printf -- '\xff\xfe' >"$tmp/parse-bin/agents/a.md"
expect parse-bin 1 "a.md: parse: unreadable (UnicodeDecodeError)"
# Closing `---` at end of file with no newline is still frontmatter.
scaffold ok-eof
printf -- '---\nname: a\ndescription: x\n---' >"$tmp/ok-eof/agents/a.md"
expect ok-eof 0 "$(ok 1)"
# CRLF line endings parse like LF.
agent ok-crlf ro "tools: Read, Glob, Grep"
sed -i 's/$/\r/' "$tmp/ok-crlf/agents/ro.md"
expect ok-crlf 0 "$(ok 1)"

echo "all agent-tools checks passed"
