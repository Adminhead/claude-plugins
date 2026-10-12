# coremods

A home for the core Claude Code mods: a git status line, a usage band, an agent status line with an expandable panel, read-only git tools for subagents, and a Bash tool manager. Each mod is a section below. Only tool-mgr adds a command (`/tool-mgr`).

Requires Claude Code 2.1.289 or later. Mods shipped in 2.1.287, and 2.1.289 has the `ui.render` fixes the usage band relies on.

The mods share one hooks module, so they draw together. Above the prompt, the usage band replaces the engine's row and the agent line stacks beneath it. The git line sits under the prompt, in the engine's hint line.

## git-line

A Claude Code mod that draws a status line directly under the prompt, beneath the engine's hint line. It shows where the session is working and the state of its git repository. It adds no skills or commands.

### What it shows

```
claude-plugins/plugins/coremods  ⎇ main ↑2 ↓1  conflict 1 staged 3 mod 2 new 2  lines +13 -2
```

| Part | Meaning | Color |
| --- | --- | --- |
| `repo/sub/dir` | Working directory, relative to the repository root's parent. Outside a repository, the absolute path | `permission` |
| `⎇ main` | Branch, or `(abc1234)` when HEAD is detached | `claude` |
| `↑2 ↓1` | Commits ahead of and behind the upstream; absent when zero or without an upstream | `success`, `warning` |
| `conflict 1` | Unmerged (conflicted) paths | `error` |
| `staged 3` | Paths with staged changes | `success` |
| `mod 2` | Paths with unstaged changes | `warning` |
| `new 2` | Untracked paths | `inactive` |
| `✓` | Clean working tree | `success` |
| `lines +13 -2` | Lines added and deleted in tracked files since the last commit, staged and unstaged together; absent when both are zero | `success`, `error` |

Labels are dimmed and the numbers take the listed colors. Colors are Claude Code theme keys, so the line follows `/theme`. A line longer than the terminal is cut with `…`.

### How it updates

The line refreshes on `session.start` and `session.measure`, which fires after each turn. It runs `git rev-parse --show-toplevel`, `git status --porcelain=v2 --branch`, and `git diff HEAD --numstat` through `$.process.run`, with repo hooks off. Changes made outside the session, such as a commit in another terminal, show up after the next turn.

If git fails, the last line stays and the error is logged once.

## usage-band

A Claude Code mod that draws a band directly above the prompt. It shows context usage by category and the 5-hour and weekly plan limits. It adds no skills or commands.

### What it shows

Compact, the default (one row):

```
ctx ██▆▆▄▄░░░░░░░░░░░░░░ 30% · 108k free  5h ━━━━━━━━──── 38% ↻1h29m  +
```

Expanded (press the `+` button; fits `maxRows`):

```
context  ██████▆▆▄▄░░░░░░░░░░░░░░░░░░┊░░░░  59k / 200k · 30% · compacts at 167k  −
         ● sys 8k  ● tools 33k  ● mcp 2k  ● agents 2k  ● memory 4k  ● skills 10k
5h       ━━━━━━━━━━━━━━──────────────────  38%  ↻ 1h 29m
weekly   ━━━━━━━━━━━━━━━━━━━━━━──────────  62%  ↻ 1d 8h
```

- Each context category uses the theme color `/context` gives it, so the band follows `/theme`. Free space and the autocompact buffer use `inactive`.
- Limit bars are `success` under 60%, `warning` under 85%, and `error` above.
- While Claude is working, the band shows the compact row whatever the chosen view.
- The band yields to surveys, and falls back to the compact row when `maxRows` is short.
- Users without rate limits (API keys) see no limit parts.
- Cost is not shown.

The band refreshes on `session.start` and `session.measure` from `$.session.usage({ breakdown: 'summary' })`, a local estimate with no API call. If that call fails, the last snapshot stays and the error is logged once.

## agent-status

A Claude Code mod that shows the subagents and teammates that are live, as a count above the prompt that expands into a panel with one row per agent. It adds no skills or commands.

### What it shows

Collapsed (the default), one line under the usage band:

```
agents 3 (2 running, 1 waiting)  tasks 2/5 ▸
```

The `▸` is a button; press it (click, or Tab onto it and Enter) to open the panel. While the panel is open the arrow reads `▾`, and pressing it closes the panel. The count line stays visible in both states. It is absent when no agent is live, and it stands aside for the engine's survey prompt.

| Part | Meaning | Color |
| --- | --- | --- |
| `3` | Live agents. Finished agents (`completed`, `failed`, `killed`) are not counted | default |
| `2 running`, `1 waiting` | Count per status: `running`, `waiting`, `idle`, `pending` | `success`, `warning`, `inactive` |
| `tasks 2/5` | Completed and total tasks; absent until a task exists | `success` |

Expanded, an `Agents` panel (a `$.ui.open` pane with id `agents`) lists every live agent:

```
explorer running <1m
run the repo survey and report back
reviewer idle 3m
review the diff for the auth change
tasks 2/5
c: collapse
```

Each agent is its name (else its description, else its type, cut at 24 characters), its status, and the time in that status (`<1m`, `3m`, `1h2m`). Under a named agent a dimmed second line gives its description, cut at the panel width. Names and descriptions are model-written, so control and escape characters are stripped. The `collapse` button (hotkey `c` while the panel has focus) closes the panel, as do Esc and ctrl+x x, and the arrow follows. When the last agent finishes, the panel stays open and reads `no live agents` until you close it.

### Where the panel appears

The surface places the panel. On the terminal's fullscreen layout it docks on the right of the transcript, about 40 columns wide. Everywhere else it opens inline above the prompt, sized to the agent count (two rows per agent, up to 16), and is resized as agents come and go.

The main-screen layout is the default under tmux, so a tmux session gets the inline panel unless fullscreen is turned on. Any one of these turns it on (checked in Claude Code 2.1.296; the order below is how the binary resolves them):

- `CLAUDE_CODE_NO_FLICKER=1` in the environment forces fullscreen. `CLAUDE_CODE_NO_FLICKER=0` (or `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN`) forces the main screen and wins over everything else.
- The `tui` setting, `"tui": "fullscreen"` (`"default"` for the main screen), when the variable is unset. `/tui fullscreen` sets it from inside a session.
- With neither set, Claude Code chooses by its own rollout rules and turns fullscreen off under tmux -CC (iTerm2 integration mode) and Windows over SSH.

The dock needs at least 110 columns. Claude Code's types say a pane opened unasked waits undrawn below 144 columns and needs 110 once the person asks; whether pressing the arrow counts as asking is unverified, so the dock may need 144.

This mod changes none of these settings.

`/clear` ends the session without a new start, so the mod resets its agent and task state, and closes the panel, on `session.end`.

### How it updates

`$.agent.list()` carries no timestamps, so the mod records when it first saw each agent in its current status. A status change restarts that clock. It polls every 5 seconds, after each Task tool call, and after each agent spawn, and it redraws only when the drawn content changes. Durations under a minute read `<1m` for that reason. While the panel is open, the same poll checks `$.ui.panes()` and resizes the panel when the agent count changes, and it resets the arrow if the panel was closed some other way.

Task counts come from `tool.call`. `TaskCreate` adds a task, `TaskUpdate` sets its status or removes it when the status is `deleted`, and `TaskList` replaces the whole set. Calls that report failure change nothing. The count starts at zero when the mod loads, so tasks created earlier appear after the next `TaskList`.

If reading the agent list fails, the last line stays and the error is logged once.

## Install

```
claude plugin install coremods@adminhead
```

## git-tools

Three read-only tools for subagents, served from the same hooks module: `mcp__coremods__git_log` (`rev`, `path`, `max_count` up to 100, default 20), `mcp__coremods__git_blame` (`path`, `rev`, `start_line`, `end_line`) and `mcp__coremods__git_show` (`rev`, `path`). Explore lists them in place of a shell.

Each call runs `git` through `$.process.run` as an argument vector, never a shell, with `--no-pager`, `--no-lazy-fetch` (a partial clone can't fetch from a remote mid-call), `--literal-pathspecs`, `--no-show-signature` on log and show, `--no-ext-diff`, `--no-textconv`, `core.fsmonitor=false`, an empty `diff.external`, and `GIT_CONFIG_NOSYSTEM=1`. Revisions must match a strict pattern and never start with `-`. Paths must stay inside the session's working directory (checked lexically, so `../` and outside absolute paths fail) and follow `--`. Blame always names a revision (default `HEAD`), so it never reads the worktree. Output is cut at 100,000 characters with a note. Bad input and git failures come back as an `error: ...` result, never as a thrown error.

The helper in `hooks/git-tools/git.ts` builds and validates the argv. The tools are registered on `session.start`, so they appear from the first prompt.

## tool-mgr

Blocks three Bash habits that have a better built-in tool. The deny rules and the `/tool-mgr` command are a mod; per-call logging and the DuckDB metrics run in classic hooks of the same plugin, so they can use a real DuckDB library. Together they log every tool call so the rules can be tuned from history.

### Rules

A blocked call never runs. Claude sees a deny message that starts with `tool-mgr:` and names the tool to use instead.

| Rule | Blocks | Use instead |
| --- | --- | --- |
| `sed-read` | A pipeline segment (split on `\|`, `&&`, `\|\|`, `;`, newline) that starts with `sed`, has no `-i`, `--in-place` or `-i.bak`, and is not fed by a pipe. `sed -n '1,20p' f` and `sed 's/a/b/' f` are blocked. `sed -i ... f` and `git log \| sed 's/a/b/'` pass | Read, with `offset` and `limit` for a line range |
| `heredoc-write` | A heredoc (`<<`, not `<<<`) together with a `>` or `>>` redirect to anything but `/dev/null`, `/dev/stderr`, `/dev/stdout`, `/dev/tty` or an fd dup (`>&2`), or with `tee <file>`. Also a heredoc consumed by an interpreter on its line, in any shape (`python3 - <<EOF`, `python3 /dev/stdin <<EOF`, `cat <<EOF \| python3`, `cat <<'EOF' \| node -`), when the body writes files. For `python`, `node`, `bun`, `deno`, `ruby` and `perl` that means `open(..., 'w'/'a'/'x')`, `.open('w')`, `Path.write_text`/`write_bytes`, `shutil.copy*`/`move`, `os.replace`/`os.rename`, `fileinput.input(..., inplace=True)`, `writeFile`, `appendFile`, `copyFile` (and `Sync` forms), `createWriteStream`, `fs.rename`, `Bun.write`, `Deno.writeFile`/`writeTextFile`, `File.write`, `IO.write`, and Perl `open(FH, '>', ...)`. For `sh`, `bash` and `zsh` it means a redirect to a real file, `tee <file>`, or `sed -i`/`perl -i` in the body | Write for a new file, Edit to change one |
| `echo-write` | A `printf` or `echo` segment (also `builtin`/`command` forms) with a `>`, `>>`, `>\|`, `N>` or `&>` redirect to anything but the devices above, or piped into `tee <file>`. `echo hi >> notes.md` and `cd x && printf x >out` are blocked. `echo hi >&2`, `printf x 2>/dev/null`, `echo "a > b"` and `printf x \| tee /dev/null` pass | Write for a new file, Edit to change one |

Heredoc bodies are read as data, not shell, so `git commit -F - <<EOF`, `cat <<EOF` with no redirect, and `python3 - <<'EOF'` that only prints all pass. Each heredoc is judged by its own body and by the command that reads it: the command it is attached to, or the one it is piped to on the same line. That command may be path-qualified (`.venv/bin/python`) or behind `sudo`, `env`, `timeout`, `nice`, `nohup`, `exec`, `time`, `command` or `uv run`, and it counts only when it reads its script from stdin (`-`, `/dev/stdin` or no script argument). So `node tool.js <<EOF` (data on stdin), `git commit -F - <<EOF` after `bun test &&`, and a commit message that mentions `write_text` or `overwriteFile` all pass.

Known gaps and false positives:

- `python3 - <<'EOF' > scratch` is blocked on purpose: it is a heredoc with a redirect to a file.
- `python -c` and `node -e` with no heredoc are not checked, nor are `sed -i` and `perl -pi -e` run directly.
- An interpreter body with a variable mode (`open(p, mode)`), a write through `os.system` or `subprocess`, or a heredoc inside a quoted `$(...)` is not caught.
- Only the segment that starts with `printf` or `echo` is checked: `printf x \| sed ... \| tee f` slips by, and so do `echo x \| sudo tee f` and `{ echo a; } > f`.
- Redirect parsing is textual: `echo>f` without a space, a redirect split by a line continuation, and `>&word` (a redirect to a file named by a word) are not caught.
- A heredoc whose pipe continues on a later line (`cat <<EOF |\n...\nEOF\npython3`) is not matched to its interpreter.
- A `<<` inside quotes (`echo "a << b" > out.txt`) is not a heredoc.
- A command longer than 4000 characters is not checked and goes through, because the rules backtrack badly on crafted long input. The log still records it, cut at 4000.
- Quoted spans are blanked before the checks, so a `;`, `|` or `>` inside quotes is not read as shell. Nesting is not parsed: a `$(...)` inside quotes, or an escaped quote inside single quotes, can still slip by or cause a false block.

If a rule check itself throws, the call goes through and the error is logged once. A failure in the log or the metrics never blocks a call.

### Log

Logging runs in classic hooks, not in the mod, so the log can be a plain fast append. `hooks/hooks.json` holds both the mod (`"modules"`) and these classic `"hooks"`.

- A `PostToolUse` / `PostToolUseFailure` hook (`scripts/log-call.ts`, run by `bun`, about 9 ms per call, async) appends one JSON line per tool call to `${CLAUDE_PLUGIN_DATA}/logs/<session_id>/<agent>.jsonl`. Exactly one of the two events fires for each call that ran.
- **`<agent>` key:** a subagent is keyed by its `agent_type` (else its `agent_id`). The main thread is always `main`, even under `--agent` (its `agent_type`, such as `orchestration`, is still recorded in the `agent_type` field). Both parts are cut to `[A-Za-z0-9._-]`, capped at 64 characters, and a leading `.` is replaced.
- Classic hooks do not fire for a call the mod denied, so the mod appends its own deny records to the same layout, with the same key: it maps the agent id to its type through `$.agent.list()` (an unknown id falls back to the id).
- Calls refused by the permission system or another hook never reach the tool, so they are not logged. Git-tools calls (`mcp__coremods__git_*`) are answered by the mod itself and are not logged either.

A mod's environment has no `CLAUDE_PLUGIN_DATA`, so the mod finds the data dir by matching: the `~/.claude/plugins/data/coremods-*` directory whose `plugin-root` file equals the mod's own `$.plugin.root` exactly (the `coremods-*` glob only picks candidates). The path is passed to `sh` as an argument. Until the SessionStart hook has written `plugin-root` (the first session), the mod skips the deny log and `/tool-mgr` answers "metrics not ready yet". If two data dirs record the same root (a `--plugin-dir` dev copy shares the install's name), the first by name wins.

A record is `{id, ts, session, agent, agent_type, permission_mode, tool, tool_use_id, cwd, command, summary, blocked, isError}`. Fields the input did not carry are left out. `id` is the `tool_use_id`, else a generated one, so ingest can dedupe. `command` is Bash only, cut at 4000 characters. `summary` is for other tools: a capped list of short fields such as `file_path`, `pattern` or `url`, never Write or Edit contents. `blocked` is the rule name for a denied call, else `null`.

- The log holds raw commands, which may contain tokens or other secrets. It stays on local disk and nothing sends it anywhere. Every writer makes directories `0700` and files `0600`: the hook, the mod's append (`umask 077`), the install script, and the DuckDB file.
- There is no rotation. Delete old session directories yourself; the DuckDB table keeps their rows.
- A hook failure never blocks a call: the hook always exits 0 with no output.

### Metrics (DuckDB)

The logs are the source of truth. Metrics live in `${CLAUDE_PLUGIN_DATA}/metrics.duckdb`, table `calls(id, ts, session, agent, agent_type, permission_mode, tool, tool_use_id, cwd, command, summary, blocked, is_error)`; `ts` is UTC. `scripts/metrics.mjs` (node, `@duckdb/node-api`) loads log records whose `id` is not in the table yet. It runs from the `Stop` and `SessionEnd` hooks (async, quiet, exit 0) and before every `/tool-mgr` query. Bad lines (including an unparseable `ts`) are skipped, and with no log files yet it only creates the table. If a hook record and a deny record share an id, the deny wins within a batch.

DuckDB allows one writer per file. If another session holds the database (DuckDB's `Could not set lock on file` / `Conflicting lock is held` error), a hook ingest is skipped silently and the next ingest catches up from the logs, so nothing is lost; `/tool-mgr` reports the lock instead. Deleting `metrics.duckdb` is safe for the same reason, as long as the logs remain.

**Dependencies:** the `SessionStart` hook (`scripts/session-start.sh`) records the plugin root in `${CLAUDE_PLUGIN_DATA}/plugin-root` and installs the DuckDB library into the data dir with `npm ci --omit=dev --ignore-scripts`. The install is done when `installed.stamp` holds the checksum of `package.json` and `package-lock.json`; the stamp is written only after `npm ci` succeeds, so a failed or killed install is retried next session. A `mkdir` lock serializes concurrent sessions, and a lock older than 10 minutes (a killed install) is taken over. The version is pinned in `plugins/coremods/package.json` with a committed lockfile. A failed install writes `install.log`, prints one line to stderr, and never blocks the session. Needs `node`, `npm` and `bun` on `PATH`.

A hooks module can import only relative files and `claude-code`, so the mod cannot load DuckDB. It runs `$.plugin.root/scripts/metrics.mjs` through `$.process.run`; the script path is never read from the data dir. At `session.start` the mod checks quietly that the install stamp and `node` are there (the SessionStart hook is async, so it may not be done yet); if a later check after a turn still fails, it logs `tool-mgr: metrics runtime not ready ...` once. The rules and logging keep working without it.

### /tool-mgr

| Form | Output |
| --- | --- |
| `/tool-mgr` | Calls per tool, blocks per rule, and calls per session and agent, over the last 7 days and all time |
| `/tool-mgr blocked [n]` | The last n blocked commands, default 10, at most 100 |
| `/tool-mgr query <sql>` | Your SQL against the database, one statement only (more are refused rather than silently dropped). It opens the file read-only with `enable_external_access=false` and `lock_configuration=true`, so it cannot write the database, read or write other files, `ATTACH`, `INSTALL` or `LOAD`. Dot-commands are refused |
| `/tool-mgr help` | Usage |

The mod sends the request to the script on stdin as JSON, never in argv. Output is plain text tables of at most 500 rows (a note says when more were cut), and the whole reply is cut at 8000 characters. The table is created before any read, so a fresh machine shows empty tables, not an error.

### Tests

- Mod and rules: `claude plugin test plugins/coremods`.
- Hook scripts (logging hook, deny-log append script, install script with a stub `npm`, ingest and query against a real temporary DuckDB file): run `npm ci` in `plugins/coremods` once, then `bun test plugins/coremods/scripts/tests` from the repo root. The specs are named `*.spec.ts` so `claude plugin test` does not try to load them.
