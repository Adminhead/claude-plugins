# Hooks in TypeScript and AST-based Bash checks

## Status

- Done: 0 (`aeed61d`), 1 (`2ed4e93`, `44918c2`; coremods 0.4.2), 5 (`c6a6ebc`, `b208ddd`; authoring 0.5.0), 2 (`c026e43`, `4d7052b`, `74e62fe`; gate GO: in-sandbox corpus p95 0.15 ms, 40 KB about 13 ms, 18 parse errors in 28,284 commands), 3 (`9336920`, `b458f75`, `f89b4a1`; coremods 0.4.3). Echo-write now fires only when every command feeding the redirect or tee is echo or printf.
- In progress: 6, 4.
- Left: 7 (7b and 7d wait on a real-session soak), 8.
- Waiting on the user: the interactive ask check that settles D2 and D4 (headless `-p` returns ask as an error to the model, so the command never runs).
- Each slice is committed to local `main` after its checks and review pass.

## Goal

Move the hooks that gain from it to TypeScript on bun, rewrite tool-mgr's Bash checks over a real shell AST, and add a small dangerous-command rule set modeled on pi-safe-shell. readonly-bash shares the parser and walker, not the policy.

Threat model: model accidents, not a determined adversary. The rules stop a mistaken `rm -rf ~` or an unreviewed piped installer. They are not a sandbox.

## Findings this plan rests on

Measured 2026-10-12. Treat sizes as snapshots.

- Mod sandbox: no Node, no `WebAssembly`, and `eval`/`new Function` throw (claude-code.d.ts, hooks-module globals). tree-sitter can't run in a mod.
- unbash 5.0.0 (Lars Kappert, ISC, zero deps, synchronous TS, published 2026-09-30) builds with `bun build --format=esm --target=browser` to 183 KB (88 KB minified). The bundle contains no `WebAssembly`, `eval`, `new Function`, `process`, `require`, `node:`, `import.meta` or `globalThis`. It has not yet run inside the real sandbox.
- unbash unquotes words (`r""m` and `$'\x72m'` both give `rm`), parses `$(...)` and heredoc-body expansions recursively, and returns `errors` alongside a partial AST.
- Speed under bun: about 6 µs per typical command, 27 ms for 80 KB, 1.7 ms to reject 2,000-deep nesting with an error.
- Corpus: 28,142 unique Bash commands from `~/.claude/projects` transcripts.
  - unbash reports errors on 13 (0.05%). Several are zsh-only syntax (`for f k in`, `*(N)`), because the Bash tool runs the user's shell, zsh.
  - 614 commands (2.2%) are over today's 4,000-character cap and skip every tool-mgr check. The longest is 40,585 characters, and none exceed 64 KB.
- A mod `tool.call` hook returns only `{ deny }` or a result.
- A mod can also register `classic.PreToolUse`, which can return `allow`, `ask` or `deny`. Its chain is [managed settings hooks, hooks modules, other settings hooks], so the mod runs before agent-frontmatter and plugin hooks.
- A `tool.call` deny ends the call before any classic hook fires.
- The tool-mgr mod already runs inside subagents. It denied a `sed` read in the planning subagent.
- `bun script.ts` run from a project directory executes that project's `bunfig.toml` `preload` and loads its `.env` (probe). `bun --no-env-file --config=/dev/null script.ts` stops both (probe). coremods runs `bun scripts/log-call.ts` without those flags today. The Python hooks use `python3 -I` for the same reason.
- Startup per run: bun about 5 ms, node about 14 ms, `python3 -I readonly-bash.py` about 23 ms.
- readonly-bash.py grew from 1,189 to 1,592 lines, and its suite to 777 cases, while this plan was written.

## Scope

| Item | Decision | Why |
| --- | --- | --- |
| tool-mgr Bash rules (`plugins/coremods/hooks/tool-mgr/rules.ts`) | Rewrite on the AST and add danger rules | the main goal |
| `hooks/readonly-bash.py` | Port to TS on the shared walker, policy 1:1 | replaces a hand-written tokenizer; starts faster |
| `plugins/infra/scripts/cloud-ops-guard.py` | Port to TS on a vendored walker copy, last | the third hand-written tokenizer |
| `plugins/authoring/scripts/docs-sync-nudge.py` | Port to TS and make it precise (D5, slice 5) | today it nudges on other sessions' changes and on historical plans |
| `hooks/orchestration-guard.py` | Keep in Python (D5) | relies on kernel `fcntl.flock`, which bun lacks; a hand-rolled lock adds races for no gain |
| `plugins/coremods/scripts/session-start.sh` | Keep as shell | the bootstrap installer must not depend on the runtime it installs |
| `plugins/code-search/scripts/codegraph-autoinit.sh` | Keep as shell | process orchestration (git, codegraph, nice, detach) with nothing to type-check |
| `plugins/github/scripts/mcp-headers.sh` | Keep as shell | a 28-line credential helper, not a hook; a rewrite only adds risk |
| `plugins/coremods/scripts/metrics.mjs` | Keep as JS on node | loads `@duckdb/node-api`, a native addon; bun compatibility is unverified |
| `plugins/coremods/scripts/log-call.ts` | Already TS; fix its bun flags | exposed to the cwd preload and `.env` |

Out of scope:
- ask rules beyond remote-exec and git-rewrite
- exfiltration rules
- a shared wrapper table (revisit after slice 8, by the rule of three)

## Design

### Parser and host

Vendor unbash into the coremods mod and run every Bash rule in-process. `classify()` stays pure TS, so it also runs under bun. That keeps fallback F cheap.

| Alternative | Why it lost |
| --- | --- |
| Classic PreToolUse hook with web-tree-sitter | Needs a 1.4 MB WASM grammar plus an npm install into `CLAUDE_PLUGIN_DATA`. That install is async, so a fresh install's first Bash calls race it. It also costs a process per Bash call and splits the rules across two hosts. unbash removes the reason for the split. Kept as fallback F, using unbash. |
| tree-sitter inside the mod | The sandbox has no `WebAssembly`. |
| bash-parser (vorpaljs) | Unmaintained. Treats `[[ ]]` as a command and `(( ))` as a subshell. |
| mvdan-sh JS build | Not tested; unbash met the need first. |
| readonly-bash folded into the mod by agent type | Would tie a global fail-closed guard to a plugin being installed. `scripts/agent-tools.py` enforces the frontmatter hook. |
| pi-safe-shell's score model | Scores hide which rule fired and invite threshold knobs. Named rules with tests are simpler. |

### Layout

- `plugins/coremods/hooks/vendor/unbash.js` is the unminified bun build. Its header names the version, tarball sha and build command. `vendor/unbash.d.ts` holds the package types.
- `plugins/coremods/hooks/shell/walk.ts` is the walker and the source of truth. It doesn't use `$`.
- Byte-identical copies live at `hooks/shell/walk.ts` and `hooks/vendor/unbash.js` (readonly-bash), and at `plugins/infra/scripts/shell/walk.ts` and `plugins/infra/scripts/vendor/unbash.js` (cloud-ops-guard).
- Each consumer's test runs `cmp` against the coremods source. Each `walk.ts` imports `../vendor/unbash.js`, so every copy resolves the same way.
- `tool-mgr/rules.ts` keeps the hygiene rules and `classify()`. `tool-mgr/danger.ts` holds the danger rules.

### Walker contract

`parse(text)` returns `{ commands, errors }`. It visits every simple command in:
- lists and pipelines
- subshells and brace groups
- `if`/`for`/`while`/`case` and function bodies
- `$(...)`, backticks, `<(...)` and `>(...)`
- expansions inside unquoted heredoc bodies

For each command it yields:
- `argv`: each word's literal value, or `null` when the word holds an expansion. `~`, `$HOME` and `${HOME}` resolve to `~`.
- `redirects`: the operator, the fd, and the literal target or `null`.
- `heredocs`: the body, and whether the delimiter was quoted.
- pipeline position: the stage index and the earlier commands in the same pipeline.
- `depth`.

`reparse(text, depth)` parses nested scripts: `sh`/`bash`/`zsh`/`dash -c STR` (bundled flags such as `-lc` included) and `eval` with all-literal arguments. Its depth cap is 8, matching readonly-bash's `MAX_DEPTH`. Each policy owns its wrapper table and decides when to call `reparse`.

### Enforcement order

1. Mod `tool.call` on Bash: parse, then the danger deny rules, then sed-read, heredoc-write and echo-write. A deny is final, and the mod logs it as today.
2. Mod `classic.PreToolUse` on Bash: call `next(e)` first, then return the stricter of the inner result and the mod's own remote-exec `ask`. A readonly-bash or cloud-ops-guard deny always wins over the mod's ask.
3. Settings-tier hooks: agent-frontmatter readonly-bash and infra's cloud-ops-guard.

A mod deny stops the chain, so the model sees one message and nothing blocks twice. A pass reaches every later hook, so there's no gap. Danger rules also cover read-only agents, because the mod sees subagent calls.

### Failure behavior

| Case | tool-mgr (mod) | readonly-bash | cloud-ops-guard |
| --- | --- | --- | --- |
| Parse error | Deny with the parser message and a hint to rewrite in plain bash or use a script file (D1) | Block, exit 2, as today | `ask`, as today |
| Over 64 KB | Deny with a hint to write a script file and run it | No cap, as today | No cap, as today |
| Exception in our code | Allow and `report` once, as today | Block, exit 2, as today | `ask`, as today |
| bun missing | n/a (in-process) | `\|\| exit 2` blocks | Hook error; the call proceeds, as with python3 missing today |

A parse error is a property of the input, and the model can fix it by rewriting. An exception is our bug, and the model can't fix it. Failing closed on an exception would stop all Bash in every session.

### Danger rules (v1)

| Rule | Tier | Blocks | Passes |
| --- | --- | --- | --- |
| `rm-root` | deny | `rm` with `-r`, `-R` or `--recursive` (any bundling) on a normalized literal target of `/`, `/*`, `~`, `~/`, `~/*`, a top-level system dir (`/bin /boot /dev /etc /home /lib /lib64 /opt /root /sbin /srv /usr /var`), `/home/<name>` or `/Users/<name>`. Also `rm --no-preserve-root`, and `find` from one of those paths with `-delete` or `-exec rm` | `rm -rf ./build`, `rm -rf "$HOME/proj/out"`, `rm -rf /tmp/x`, `echo "rm -rf /"`, `git commit -m "rm -rf /"` |
| `disk-wipe` | deny | `mkfs*`, `wipefs`, `blkdiscard`, `sgdisk -Z`/`--zap-all`, `dd of=/dev/<block>`, `shred /dev/*`, an output redirect to `/dev/<block>` | `dd if=/dev/zero of=./img`, `lsblk`, `> /dev/null` |
| `system-perms` | deny | `chmod`, `chown` or `chgrp` with `-R`/`--recursive` on `/` or a top-level system dir | `chown -R buck:buck ~/proj`, `chmod -R u+w ./dist`, `chown -R "$USER" ~` |
| `priv-escalation` | deny (D3) | any `sudo`, `doas`, `su`, `pkexec` or `run0` command, wherever it sits in the AST | `echo sudo`, `git commit -m "sudo fix"`, `man sudo` |
| `git-rewrite` | ask (D4) | `git push` with `--force`, `-f`, `--force-with-lease` or a `+refspec`; `git reset --hard` | `git push`, `git reset --soft HEAD~1`, `git reset HEAD file` |
| `remote-exec` | ask (D2) | A pipeline with `curl` or `wget` (or `base64 -d`, `xxd -r`) upstream of a shell or interpreter reading its program from stdin. Also `bash`/`sh`/`zsh`/`source`/`.` with a `<(curl …)` operand, and `eval` or `sh -c` with a `$(curl …)` argument | `curl x \| jq .`, `curl x \| python3 -m json.tool`, `curl x \| python3 -c '…'`, `curl -o f x` |

- **Seen through:**
  - wrappers: `sudo doas env nice nohup time timeout stdbuf command builtin exec setsid xargs`
  - `find -exec`, `-execdir` and `-ok`
  - `sh -c` and literal `eval`
  - path-qualified names such as `/bin/rm`
  - heredoc bodies fed to a shell
- **Path normalization:** literal targets are normalized first (`/..`, `//`, `/.`, trailing slash).
- **Order:** danger rules run before hygiene rules, so the deny message names the danger.
- **Out of scope**, because the threat model is accidents:
  - variable indirection (`$CMD`, `X=/; rm -rf "$X"`)
  - `cd / && rm -rf *`
  - `rsync --delete`
  - download-then-run (`curl -o f && bash f`)
  - destructive code inside `python -c`
  - zsh glob-qualifier code (`*(e:…:)`)
  - aliases and functions defined outside the command
  - fork bombs
- `priv-escalation` runs first, so `sudo rm -rf /` names privilege escalation. The other rules still see through `sudo`, so the walker's wrapper handling is tested either way.

### Runtime

- Every TS hook runs as `bun --no-env-file --config=/dev/null <absolute path>.ts`.
- Hook scripts import only relative files and `node:` builtins. Bun auto-installs missing bare imports when no `node_modules` exists.
- Global hook form: `bun --no-env-file --config=/dev/null "$HOME/.claude/hooks/readonly-bash.ts" || exit 2`.
- Test harnesses use the same line. The shebang `#!/usr/bin/env -S bun --no-env-file --config=/dev/null` lets `"$HOOK"` run directly.

### Latency per Bash call

- **Mod:** parsing is in-process, about 6 µs typical under bun. The sandbox engine's speed is unknown, and slice 2 measures it against a budget: corpus p95 at most 2 ms, and a 40 KB command at most 100 ms.
- **readonly-bash:** about 5 ms of bun startup, against about 23 ms for the Python version today.
- **Fallback F:** about 5 ms of bun startup plus Claude Code's hook dispatch (UNCONFIRMED) on every Bash call.

## Decisions

Settled:
- The host is the mod, with vendored unbash. Fallback F applies if slice 2's gate fails.
- Exceptions fail open with a report.
- Commands over 64 KB are denied. None of the 28,142 corpus commands is that long.
- Shared code is copied with a `cmp` drift check, never imported across directories.
- The ask tier holds remote-exec and git-rewrite.

Decided by the user (2026-10-12):
- **D1, parse errors in tool-mgr:** deny with the parser message and a rewrite hint. The cost is about 0.05% of commands, mostly zsh-only syntax.
- **D2, remote-exec tier:** ask, if the slice 2 spike shows `classic.PreToolUse` `ask` prompts in the user's permission mode and inside subagents. Otherwise deny, with a message telling the model to hand the command to the user.
- **D3, sudo on its own:** deny any `sudo`, `doas`, `su`, `pkexec` or `run0` (`priv-escalation`). The model hands such commands to the user.
- **D4, git force-push and hard reset:** ask (`git-rewrite`), with the same deny fallback as D2.
- **D5, Python leftovers:** port docs-sync-nudge, and keep orchestration-guard in Python.

## Slices

### 0. Commit the baseline (orchestrator)

Files: the six modified files (`plugins/coremods/hooks/tool-mgr/rules.ts`, `plugins/coremods/tests/tool-mgr.test.tsx`, `plugins/coremods/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `README.md`, `docs/plugins/coremods.md`). They carry coremods 0.4.1: printf/echo and interpreter-heredoc write hardening.

- Run the checks, then commit with explicit paths as `feat(coremods): …`.
- Checks: `claude plugin test plugins/coremods`, `claude plugin validate --strict plugins/coremods`, `claude plugin validate --strict .`.
- Accept: green checks; those paths clean in `git status`.
- Parallel: no. This slice comes first.

### 1. Bun isolation for log-call (coder)

Files: `plugins/coremods/hooks/hooks.json`, new `plugins/coremods/scripts/tests/bun-isolation.spec.ts`, coremods 0.4.2 (plugin.json, marketplace.json).

- Add `--no-env-file` and `--config=/dev/null` before the script path in both log-call entries.
- The spec reads hooks.json and runs each `bun` entry's argv from a temp dir. That dir holds a `bunfig.toml` whose preload writes a marker, and a `.env` that sets a probe variable. The spec asserts there is no marker and the variable is unset.
- Checks: `bun test plugins/coremods/scripts/tests`, plugin test and validate.
- Accept: the spec fails against the old hooks.json and passes against the new one.
- Parallel: with 2 and 5.

### 2. Parser foundation and gate (coder-high)

Files: `plugins/coremods/hooks/vendor/unbash.js` and `.d.ts`, `plugins/coremods/hooks/shell/walk.ts`, `plugins/coremods/tests/shell.test.tsx`, `scripts/bash-replay.ts`.

- Vendor unbash 5.0.0 and write `walk.ts` per the contract above.
- Walker tests run in the sandbox under `claude plugin test`, which proves the bundle loads. Cover:
  - pipelines, lists, subshells and brace groups
  - `if`/`for`/`while`/`case` and function bodies
  - `$( )`, backticks and `<( )`
  - quoted and unquoted heredocs
  - the `-c` and `eval` reparse
  - unquoting `r""m` and `$'\x72m'`
  - `~` and `$HOME` resolution
  - `null` argv for expansions
  - the depth cap and an error case
  - a 2,000-deep nesting input that must not throw
- Timing test: parse 1 KB, 4 KB and 40 KB samples in the sandbox and record the durations.
- Live check: start `claude --plugin-dir plugins/coremods` and confirm the mod loads and a parsed-command deny fires.
- Ask spike: add a throwaway `classic.PreToolUse` that returns `{ ask }` for one marker command. Record whether it prompts in default mode and in the user's usual mode, whether it fires in a subagent, and what `-p` does. Then remove it.
- `scripts/bash-replay.ts`:
  - Reads Bash commands from `~/.claude/projects/**/*.jsonl` and dedupes them.
  - Runs them through two checkers (a module export or a hook command).
  - Prints counts and every disagreement as a 160-character excerpt.
  - It's a local dev tool. Never commit its output, because transcripts can hold secrets.
- Gate: go if unbash loads in the sandbox, the walker tests pass, and timing meets the budget. Otherwise switch to F.
- Checks: `claude plugin test plugins/coremods`, `claude plugin validate --strict plugins/coremods`.
- Parallel: with 1 and 5.

### 3. Hygiene rules on the walker (coder-high; review)

Depends on 2 (go). Files: `tool-mgr/rules.ts`, `hooks/register.tsx`, `tests/tool-mgr.test.tsx`, `docs/plugins/coremods.md`.

- Rewrite sed-read, heredoc-write and echo-write over walker commands.
- Delete `shellText`, `stripHeredocBodies`, `SEGMENT_SPLIT`, `OPERATOR_SPANS`, `consumers` and `interpreterOf`'s token split. Remove the "fail-open is the intended direction" shortcut comments.
- Keep `BODY_WRITES` for interpreter bodies, and keep the messages.
- Add the parse-error deny (D1) and the 64 KB deny to `classify()`. Keep register.tsx's fail-open on exceptions. `MAX_COMMAND` stays only as the log cap.
- Every existing classify test passes unchanged, except a written list of intended changes, each with its new assertion. Example: `sed -n p <<< "$x"` reads no file.
- Replay old against new `classify()` over the corpus. Review every disagreement and put the counts in the commit message.
- Checks: plugin test and validate.
- Accept: green tests, zero unexplained replay disagreements, and commands over 4,000 characters now checked.
- Parallel: no. It shares files with 4.

### 4. Danger rules, ask hook, coremods 0.5.0 (coder-high; security-auditor, review)

Depends on 3. Files: `tool-mgr/danger.ts`, `tool-mgr/rules.ts` (`Rule` union and order), `hooks/register.tsx` (`classic.PreToolUse`), `tests/tool-mgr.test.tsx`, `docs/plugins/coremods.md`, `README.md`, plugin.json and marketplace.json at 0.5.0.

- Implement the v1 table, including path normalization.
- Each rule gets block cases, the pass column, and these evasion cases:
  - `rm -r -f /`, `rm -fr ~`, `/bin/rm -rf /`, `\rm -rf /`, `r""m -rf /`
  - `sudo env X=1 rm -rf ~`, `timeout 5 rm -rf /`
  - `find / -delete`
  - `bash -lc 'rm -rf ~'`, `( rm -rf / )`, `if true; then rm -rf ~; fi`
  - `f(){ rm -rf /; }; f`, a `bash <<EOF` body, `echo $(rm -rf ~)`
- `priv-escalation` cases: `sudo apt install x`, `/usr/bin/sudo -n true`, `env sudo ls`, `echo $(sudo id)`, `bash -c 'doas ls'`, plus its pass column.
- `git-rewrite` cases: `git push -f origin main`, `git push origin +main`, `git -C repo push --force`, `git reset --hard HEAD~1`, plus its pass column.
- remote-exec and git-rewrite go through `classic.PreToolUse` per D2 and D4.
- Composition tests for that hook:
  - It calls `next` before deciding.
  - With `next` stubbed to return `{ deny }`, `curl x | bash` gets that deny.
  - With `next` stubbed to return `{ allow }`, it gets `{ ask }`.
- Replay: list every danger hit in the corpus and judge it. Narrow any rule with a false positive.
- Docs: the rules table, the failure table, the threat model and the out-of-scope list.
- Checks: plugin test, `claude plugin validate --strict plugins/coremods`, `claude plugin validate --strict .`.
- Accept: green tests, every corpus hit a true positive, and the ship-plugin records agree.
- Parallel: no.

### 5. docs-sync-nudge in TS, made precise (coder-high; quick-review)

Files: `plugins/authoring/scripts/docs-sync-nudge.ts` (delete the .py), `plugins/authoring/hooks/docs-sync.json`, `plugins/authoring/scripts/tests/check-docs-sync.sh`, the authoring version (minor bump), marketplace.json, `docs/plugins/authoring.md`.

Problems seen on 2026-10-12, in a session that wrote only a plan file:
- **Wrong attribution.** `changed_paths` takes the whole dirty tree plus every commit since session start. It nudged twice about other sessions' uncommitted work and commits (`7e47870`, `af4a59e`, `7e2ffb8`).
- **Historical docs.** It grepped `docs/plans/*`, which name files by design and aren't meant to track the code.
- **Vague output.** It lists docs but not which changed file each one mentions or where, so checking means re-grepping.

Changes:
- **Attribute by edit, not by tree.** A new PostToolUse hook (matcher `Edit|Write|MultiEdit|NotebookEdit`, sync, not async, so the record lands before Stop) appends `tool_input.file_path` to `<state>/<session>.edited`. Stop uses only that set, resolved against the repo top. Paths outside the repo (other worktrees) are dropped. The dirty-tree scan and the commit-range scan go away. The SessionStart HEAD baseline stays, and is used only to diff the edited files.
  - shortcut: edits made through Bash (`sed -i`, `mv`, codegen) aren't seen; upgrade if missed nudges show up in practice.
  - Verify in the slice whether a subagent's PostToolUse carries the parent's `session_id` (UNCONFIRMED). If it doesn't, also key the record by `agent_id`'s parent, or note the gap in the docs.
- **Skip historical docs.** Don't search `docs/plans/`, `docs/research/`, `docs/adr/`, `.agents/` or `CHANGELOG*`. These are records of a moment, not claims about current code.
- **Find stale names, not just mentions.** From `git diff -U0 <baseline> -- <edited files>` (this covers committed and uncommitted edits), take identifiers on removed lines: words of 4 or more characters that look like code (`snake_case`, `camelCase`, `CONST_CASE`, `--flag`, `ENV_VAR`). Keep only those that no longer appear anywhere in tracked non-doc files (`git grep -w -F`). A doc that still names one of these is very likely stale.
- **Rank and point.** Report up to 10 docs as `path:line → name`, in two tiers:
  - "names something that no longer exists in code": the removed-identifier hits.
  - "mentions an edited file": full-path hits first, then basename hits.
  - Docs this session also edited are dropped, as today.
- **Keep:** once-per-change-set digest, `stop_hook_active` guard, prune, fail-open, the non-error `additionalContext` form, and the docs-audit offer.
- Tests (extend check-docs-sync.sh; run the .ts with the isolation flags):
  - a file another process changed (dirty tree, or a commit not made through a recorded edit) produces no nudge
  - an edit through the Write hook to a file a doc mentions produces a nudge naming that doc and line
  - a mention only in `docs/plans/` produces no nudge
  - renaming a constant that a README names produces a "no longer exists" entry; renaming one still used elsewhere doesn't
  - the same change set nudges once; a doc edited in the session is dropped
- Checks: `bash plugins/authoring/scripts/tests/check-docs-sync.sh`, `claude plugin validate --strict plugins/authoring`, `claude plugin validate --strict .`.
- Accept: the tests pass, and replaying this session's situation (another session's commits plus a plan-only edit) gives no nudge.
- Parallel: with 1 to 4 and 6.

### 6. readonly-bash.ts beside the Python (coder-max; review, security-auditor)

Depends on 2. Start with `git status hooks/` and `git log -3 -- hooks/readonly-bash.py`, and re-read the then-current file.
Files: `hooks/readonly-bash.ts`, `hooks/shell/walk.ts`, `hooks/vendor/unbash.js`, `hooks/tests/readonly-bash.test.sh`.

- Port every `check_*`, `strip_wrappers`, the assignment and env rules, and the SQL logic 1:1.
- Replace `Tokenizer`, `check_command` and `check_segment` with the walker.
- Keep it fail-closed: any error exits 2 with the same message shape.
- test.sh:
  - Add a `HOOK` env override. The default stays the .py.
  - `cmp` the copies against the coremods source.
  - Run the suite against both implementations.
- Differential replay of .py against .ts over the corpus. Classify every disagreement as an intended fix or a regression, and allow zero regressions toward allow.
- Checks: `bash hooks/tests/readonly-bash.test.sh` with `HOOK` set to the .py, then to the .ts, then the replay.
- Accept: the suite is green on both, and the replay is clean.
- Parallel: with 3 to 5.

### 7. Cut over readonly-bash (coder; quick-review)

Depends on 6. Run `git status agents/ hooks/ scripts/` before each step.
Files: `agents/{architect,browser-tester,debugger,debugger-critical,quick-review,review,security-auditor}.md`, `agents/CLAUDE.md` (the readonly-bash lines near 39, 60 and 70), `scripts/agent-tools.py` (near lines 12, 99 and 156), `scripts/agent-tools.test.sh`, `hooks/tests/readonly-bash.test.sh`.

- a. agent-tools.py accepts either the Python command or the bun command carrying both isolation flags. Add tests for both forms and for a bun command missing a flag.
- b. Canary: flip only `quick-review.md`, and use it in real sessions for a few days.
- c. Flip the other six agents and `agents/CLAUDE.md`, and change test.sh's default `HOOK` to the .ts.
- d. After a soak with no `readonly-bash: internal error`, delete readonly-bash.py and make agent-tools.py require the bun form.
- Checks: `python3 scripts/agent-tools.py`, `bash scripts/agent-tools.test.sh`, `bash hooks/tests/readonly-bash.test.sh`.
- Rollback: revert the step's commit. The .py stays until step d.
- Parallel: with 8.

### 8. cloud-ops-guard in TS (coder-high; review)

Depends on 2; best after 6 settles the walker.
Files: `plugins/infra/scripts/cloud-ops-guard.ts` (delete the .py), `plugins/infra/scripts/shell/walk.ts`, `plugins/infra/scripts/vendor/unbash.js`, `plugins/infra/hooks/hooks.json`, `plugins/infra/scripts/tests/check.sh`, the infra version, marketplace.json, `docs/plugins/infra.md`.

- Keep the plain-text allowlist as it is, since it needs no parser. Move the deny check onto the walker. Keep "any exception prints ask".
- check.sh invokes the hook through bun with the isolation flags and `cmp`s the copies. Its Python test tooling can stay.
- Checks: `bash plugins/infra/scripts/tests/check.sh`, `claude plugin validate --strict plugins/infra`, `claude plugin validate --strict .`.
- Parallel: with 7.

### F. Fallback if slice 2's gate fails (coder-high)

Replaces the mod host in slices 3 and 4.

- `plugins/coremods/scripts/bash-guard.ts`:
  - It is a classic PreToolUse hook (matcher `Bash`) run by bun with the isolation flags.
  - It imports `../hooks/tool-mgr/rules.ts` and prints `permissionDecision` deny or ask JSON.
  - It appends its own deny record, in the same record shape, to `${CLAUDE_PLUGIN_DATA}/logs`.
- Drop the Bash branch from the mod's `tool.call`.
- Accepted costs: about 5 ms and a process per Bash call, and fail-open when bun is missing.

## Verification

| Condition or risk | Cheapest reliable evidence | Rerun when | If it fails |
| --- | --- | --- | --- |
| The sandbox loads unbash | walker tests under `claude plugin test`, plus the live session | unbash or its vendor build changes | switch to F |
| In-sandbox parse cost is within budget | the timing test | Claude Code upgrade | switch to F or lower the cap |
| Hygiene behavior is kept | existing classify tests, plus the old-against-new replay | rules.ts or walk.ts changes | diagnose each disagreement before editing tests |
| Danger rules have no false positives on real commands | corpus hits reviewed by hand | a rule changes | narrow the rule |
| Danger rules catch the evasions | unit tests, one per evasion | a rule or walk.ts changes | fix the walker or the rule |
| A readonly-bash deny beats the mod's ask | stubbed-`next` composition tests | register.tsx changes | block the release |
| `ask` prompts in the user's mode | the slice 2 manual spike | Claude Code upgrade | D2 and D4 fall back to deny |
| No cwd preload or `.env` reaches a hook | bun-isolation spec, plus agent-tools.py flag check | hooks.json or frontmatter changes | block the release |
| readonly-bash parity | test.sh on both implementations, plus the differential replay | either implementation changes | classify each case as fix or regression |
| Walker copies don't drift | `cmp` in each consumer's test | any walk.ts edit | re-copy |

## Risks and rollback

- **Parse-error deny hits legitimate zsh syntax.** Expected about 0.05% of commands. D1 can switch to allow. Roll back by reverting to 0.4.2 or disabling coremods.
- **A bad vendored bundle stops every coremods mod from loading.** `claude plugin test`, validate and slice 2's live check catch it before release.
- **The sandbox engine is much slower than bun.** The gate catches it, and F covers it.
- **ask is ignored in bypass or auto mode.** The spike checks this, and D2 covers it.
- **The readonly-bash port regresses toward allow.** Covered by the differential replay, the canary, and keeping the .py until the soak ends.
- **readonly-bash keeps changing.** Slice 6 re-reads the file and gates on the replay and the suite, not on line counts.

## Done when

- coremods 0.5.0 ships the AST hygiene rules and danger rules, with docs, green tests and a clean corpus replay.
- All seven read-only agents run readonly-bash.ts, the .py is deleted, and agent-tools.py requires the bun form.
- cloud-ops-guard.ts is released, and log-call runs with the isolation flags.
- docs-sync-nudge.ts nudges only on this session's edits, skips historical docs, and points at `path:line` with the stale name.
- The bun-isolation spec and agent-tools.py enforce both isolation flags on every bun hook.
