# Worked hook examples

Grounded in https://code.claude.com/docs/en/hooks and https://code.claude.com/docs/en/hooks-guide, fetched 2026-10-17, plus this repo's archived `archive/plugins/coremods/hooks/hooks.json`. Shell scripts 1 to 4 were run by hand on 2026-10-17 by piping sample input through them and checking exit code and stdout (details under each example); the command variant in 5 was checked only on its `stop_hook_active` early-exit path, and the `prompt` hook can only be exercised live. All five pass `shellcheck -S warning`.

Each example gives the hooks.json/settings.json fragment and the script. Scripts need `jq` (`apt-get install jq`, `brew install jq`). Save project scripts under `.claude/hooks/` and `chmod +x` them.

## 1. PreToolUse: deny dangerous Bash commands (fail closed)

Denies via `permissionDecision` so Claude reads the reason. Exec form, so the placeholder is never shell-parsed. `onFailure: "block"` makes a missing or crashing script block the call instead of letting it through. Match `Bash|PowerShell` so the hook also fires on Windows hosts that only register the PowerShell tool.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-bash.sh",
            "args": [],
            "timeout": 10,
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# .claude/hooks/guard-bash.sh: PreToolUse guard for shell commands.
# Exit 0 with no output = no opinion (normal permission flow). JSON deny = block with a reason Claude sees.
set -u
input=$(head -c 1048576)                       # bound model-controlled input
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
[ -n "$cmd" ] || exit 0

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# Patterns are checked against the whole string so subcommands after ; & | and inside $( ) or backticks are covered.
b='(^|[;&|(`"'"'"'[:space:]])'               # what may precede a command name, quotes included so echo "rm -rf /" is caught too
grep -Eq "${b}rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+(/|~|\\\$HOME)([[:space:])\`\"';&|]|\$)" <<<"$cmd" \
  && deny "Refusing recursive delete of a root or home path: $cmd"
grep -Eq "${b}git[[:space:]]+push[[:space:]].*(--force([[:space:]]|\$)|-f([[:space:]]|\$))" <<<"$cmd" \
  && deny "Force-push is blocked in this repo; use --force-with-lease after asking"
grep -Eq "${b}(curl|wget)[[:space:]][^|]*\\|[[:space:]]*(ba|z|)sh([[:space:]]|\$)" <<<"$cmd" \
  && deny "Piping a download into a shell is blocked; save the script and review it first"
grep -Eq -- '--no-verify' <<<"$cmd" \
  && deny "Skipping git hooks with --no-verify is blocked"

exit 0
```

Test: `echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | .claude/hooks/guard-bash.sh` prints the deny JSON and exits 0; `npm test` prints nothing and exits 0. Checked on 2026-10-17: denies `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, `echo $(rm -rf /)`, `` x=`rm -fr /` ``, `ls; rm -rf /`, `git push --force`, `git push -f`, `FOO=1 git push --force`, `curl … | sh`, `wget … | bash`, `--no-verify`; stays silent on `npm test`, `rm -rf ./build`, `rm -rf /tmp/build`, `git push --force-with-lease`, and an empty `tool_input`. It is deliberately a short pattern list, not a shell parser: `echo "rm -rf /"` is also denied, which is the fail-closed side of the trade. For a prompt instead of a block, change `"deny"` to `"ask"`; the user then sees the reason in the permission dialog labelled `[settings]`.

A `PreToolUse` deny holds even in `bypassPermissions`. It is still a regex over text; for an unconditional rule, add a `permissions.deny` entry too.

## 2. PostToolUse: format the edited file (fail open, silent)

Runs the formatter after `Edit`/`Write`, prints nothing on stdout, and exits 0 whatever happens, so a formatter crash never surfaces as a hook error. For files Claude rewrites through Bash, add a `FileChanged` hook or run the formatter from a `Stop` hook over `git status --porcelain`.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/format.sh",
            "args": [],
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# .claude/hooks/format.sh: PostToolUse formatter. Never blocks, never prints to stdout.
set -u
input=$(head -c 1048576)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
file="${file//\\//}"                            # Windows backslashes -> slashes
[ -n "$file" ] && [ -f "$file" ] || exit 0
case "$file" in *..*) exit 0 ;; esac            # never follow traversal

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md)
    command -v npx >/dev/null 2>&1 && npx --no-install prettier --write "$file" >/dev/null 2>&1 ;;
  *.py)
    command -v ruff >/dev/null 2>&1 && ruff format "$file" >/dev/null 2>&1 ;;
  *.go)
    command -v gofmt >/dev/null 2>&1 && gofmt -w "$file" >/dev/null 2>&1 ;;
esac
exit 0
```

To tell Claude something after the tool ran (for example "this file is generated"), print `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}` instead of staying silent; to make it stand out as an error, `echo msg >&2; exit 2` (the tool already ran, so this only annotates). The `claude-seo` plugin's `validate-schema.py` does exactly that split: critical findings exit 2 with stderr, warnings go out as `additionalContext`.

## 3. UserPromptSubmit: inject repo state as context

Adds the branch and dirty-file count next to every prompt. Context goes under `hookSpecificOutput`; a top-level `additionalContext` is silently ignored. Keep it fast (default timeout here is 30 s and the prompt waits). Write facts, not instructions.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/prompt-context.sh",
            "args": [],
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# .claude/hooks/prompt-context.sh: UserPromptSubmit context injector. Exit 0 with no output when not in a git repo.
set -u
input=$(head -c 1048576)
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -n "$cwd" ] && git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
dirty=$(git -C "$cwd" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
ctx="Git branch: ${branch}. Uncommitted changes: ${dirty} file(s)."

jq -nc --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
```

To block a prompt instead, print `{"decision":"block","reason":"..."}` (the reason goes to the user, not to context) or exit 2 with the reason on stderr. The prompt text still lands in the transcript file; `suppressOriginalPrompt: true` only trims the block message. For a typed `/command`, `prompt` is the literal line; match on the command with `UserPromptExpansion` instead.

## 4. SessionStart: set env vars for Bash with CLAUDE_ENV_FILE

Writes `export` lines to `$CLAUDE_ENV_FILE`; Claude Code runs that file before every Bash command for the rest of the session. Keyed on `source` so it doesn't rerun after `/clear` or compaction. Use `>>` so other hooks' exports survive. Only `command` (and `mcp_tool`, not at launch) handlers run on this event.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|fork",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/session-env.sh",
            "args": [],
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# .claude/hooks/session-env.sh: SessionStart env setup. Fails open: exits 0 always.
set -u
[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0

{
  echo 'export NODE_ENV=development'
  echo 'export PATH="$PATH:./node_modules/.bin"'   # Bash evaluates the file, so $PATH is fine here
  if command -v direnv >/dev/null 2>&1; then
    direnv export bash 2>/dev/null                   # emits export lines for the cwd's .envrc
  fi
} >> "$CLAUDE_ENV_FILE"

# Optional: give Claude a fact about the environment. Plain stdout on SessionStart becomes context.
echo "Node project; run tests with 'npm test'. Env vars loaded from CLAUDE_ENV_FILE."
exit 0
```

Notes: `CLAUDE_ENV_FILE` is also set for `Setup`, `CwdChanged` and `FileChanged` hooks. PowerShell tool commands only receive the variables when every line is a plain `NAME=value` assignment, so the `$PATH` line above keeps PowerShell from getting any of them (Bash still gets all). To re-inject conventions after compaction, add a second group with `"matcher": "compact"` whose command `echo`es the reminder.

Plugin variant from this repo (archived `coremods/scripts/session-start.sh`): a `SessionStart` hook that records `${CLAUDE_PLUGIN_ROOT}` into `${CLAUDE_PLUGIN_DATA}/plugin-root`, then runs `npm ci` into `${CLAUDE_PLUGIN_DATA}` when a checksum stamp of `package.json` + `package-lock.json` is missing, serialized with a `mkdir` lock and always exiting 0. That is the documented install pattern, since `Setup` only fires on `--init-only`/`--init`/`--maintenance`.

## 5. Stop: keep working until the work is done (prompt type)

A `prompt` hook sends `$ARGUMENTS` (the Stop input, including `last_assistant_message`) to a model, which must answer `{"ok": true}` or `{"ok": false, "reason": "..."}`. On `ok: false` the reason becomes Claude's next instruction and the turn continues; `impossible: true` lets the turn end when the condition can never hold. Claude Code applies the same 8-consecutive-block cap as a command hook.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are judging whether Claude may stop. Input: $ARGUMENTS\n\nReturn {\"ok\": true} when the last assistant message shows the user's request was completed, or when stop_hook_active is true. Return {\"ok\": false, \"reason\": \"<what is still missing>\"} when it reports partial work, a failing test, or an unanswered question that Claude could resolve itself. Return {\"ok\": false, \"impossible\": true, \"reason\": \"...\"} when the remaining work needs something only the user can supply.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

A command-hook equivalent must check `stop_hook_active` itself:

```bash
#!/bin/bash
# .claude/hooks/stop-tests.sh: block stopping while the test suite fails, once.
input=$(cat)
[ "$(jq -r '.stop_hook_active' <<<"$input")" = "true" ] && exit 0
if ! npm test >/dev/null 2>&1; then
  jq -nc '{decision:"block",reason:"npm test is failing. Fix the failures before finishing."}'
fi
exit 0
```

`/goal` is the built-in shortcut for a session-scoped prompt Stop hook. For verification that needs to read files or run commands, use `"type": "agent"` (experimental, 60 s default, up to 50 tool turns, no `impossible`).

## 6. Plugin hooks.json mixing mods and classic hooks (this repo)

The archived `coremods` plugin kept its mod and its classic hooks in one file. Every classic hook is exec form, async, fail-open, and reaches its script through `${CLAUDE_PLUGIN_ROOT}`; `bun --no-env-file --config=/dev/null` keeps a project's `bunfig.toml` preload and `.env` out of the hook process. Because the mod's `tool.call` can deny a call, the classic `PostToolUse` logger never sees denied calls, which is why the mod writes its own deny records.

```json
{
  "modules": ["./register.tsx"],
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "sh", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/session-start.sh"], "async": true, "timeout": 180 }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "bun", "args": ["--no-env-file", "--config=/dev/null", "${CLAUDE_PLUGIN_ROOT}/scripts/log-call.ts"], "async": true, "timeout": 10 }] }
    ],
    "PostToolUseFailure": [
      { "hooks": [{ "type": "command", "command": "bun", "args": ["--no-env-file", "--config=/dev/null", "${CLAUDE_PLUGIN_ROOT}/scripts/log-call.ts"], "async": true, "timeout": 10 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/metrics.mjs"], "async": true, "timeout": 60 }] }
    ]
  }
}
```

`scripts/log-call.ts` reads stdin once, returns early when `tool_name` is missing, appends one JSONL line under `${CLAUDE_PLUGIN_DATA}/logs/<session>/<agent>.jsonl` with mode 0600, catches everything, and `process.exit(0)` with empty stdout. Its tests in `scripts/tests/log-call.spec.ts` spawn the script with `CLAUDE_PLUGIN_DATA` pointed at a temp dir and assert exit 0, empty output and the written record; they are `*.spec.ts` because `claude plugin test` would load a `*.test.ts` as a mod test. Note the doc says `timeout` isn't enforced once an `async` command hook is running, so the `timeout` values on these async hooks are documentation, not a limit.

## Patterns seen in third-party repos that diverge from the docs

Use these as things to fix when reviewing someone else's hooks:

- `"timeout": 5000` on every hook (`claude-code-best-practice/.claude/settings.json`). The field is seconds, so that is 83 minutes.
- `"async": true` on `PreToolUse`, `PermissionRequest` and `Stop` hooks (same file). Async hooks can't block, approve or keep Claude working; those events become no-ops.
- Unquoted `${CLAUDE_PROJECT_DIR}` in a shell-form `command` (same file). Breaks on paths with spaces; use `args` or quote it.
- A hooks README listing input fields that aren't in the reference (`compact_trigger`, `config_source`, `stop_reason`, `isolation_reason`, `server_name`, `elicitation_schema`) and describing `Setup` as a `/setup` command. The real fields are `trigger`, `source`, `last_assistant_message`, `name`, `mcp_server_name`, `requested_schema`; `Setup` fires only from the CLI flags.
- `once` offered as a settings-file option. It is honored only in skill frontmatter.
- A `${tool_input.file_path}` placeholder inside a command hook's `args` (`claude-seo/hooks/hooks.json`). The reference documents `${path}` substitution from the hook input only for `mcp_tool` `input` values; a command hook should read the field from stdin.
- A several-kilobyte `node -e` bootstrap inlined into `command` to locate the plugin root (`ECC/hooks/hooks.json`). `${CLAUDE_PLUGIN_ROOT}` in exec form does this in one line.
- `".*"` matchers everywhere (ECC). Omitting the matcher is equivalent and avoids the regex path.
- `MultiEdit` in matchers (ECC). Not a tool the reference lists; harmless but dead.
- Per-event `disable*Hook` flags in a side config read by one dispatcher script (`claude-code-best-practice/.claude/hooks/config/hooks-config.json`). Works, but the registered hook still spawns a process for every event; prefer removing the entry, since there is no built-in per-hook disable.

Things those repos do well: ECC's scripts bound stdin (`MAX_STDIN = 1 MiB`) and document exit codes at the top of each script; `block-no-verify.js` scans subcommands rather than trusting a single regex; `claude-seo` splits findings into exit-2 errors and `additionalContext` warnings.
